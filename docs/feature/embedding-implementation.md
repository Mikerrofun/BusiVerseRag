---

**Дата:** 01.11.2026
**Теги:** #features #embeddings #rag

---

## 1. Зачем

После чанкования чанки лежат в БД как текст — искать по ним можно только fulltext'ом. Для векторного поиска (план 1, этап поиска) каждому чанку нужен эмбеддинг `vector(1024)`. Нужен скрипт, который берёт чанки из БД, получает вектора через Jina и записывает их обратно по `chunk_id`.

## 2. Где/что уже было

- Таблица `chunks` с колонкой `embedding vector(1024)` и HNSW-индексом — создана миграцией `0000`, ничего в схеме не менялось.
- Паттерн скрипта-загрузчика из `scripts/chunking/load.ts`: dry-run по умолчанию, запись по `--apply`, retry.
- `withRetry` вынесен в `scripts/lib/retry.ts` — общий для всех скриптов, свой ретрай не писался.
- Структура `config/` + `types/` — как в `scripts/chunking/`.

## 3. Реализация

Новые файлы: `scripts/embeddings/embed.ts`, `scripts/embeddings/config/embeddings.config.ts`, `scripts/embeddings/types/embeddings.types.ts`, `scripts/lib/retry.ts`. Команда: `npm run embed` (dry-run) / `npm run embed -- --apply` (запись).

Конфиг — модель одна на весь проект, смена только здесь:

```ts
// scripts/embeddings/config/embeddings.config.ts
export const EMBED_CONFIG = {
  jinaUrl: 'https://api.jina.ai/v1/embeddings',
  model: 'jina-embeddings-v5-omni-small',
  dimensions: 1024, // зафиксировано схемой: chunks.embedding vector(1024)
  batchSize: 32,
  batchPauseMs: 500,
} as const;
```

Ключевой момент — contextual retrieval (план 1, раздел 6.2): на вход модели идёт не голый текст, а путь заголовков + текст:

```ts
// scripts/embeddings/embed.ts
const inputs = batch.map((r) => `${r.heading_path.join(' > ')}\n\n${r.text}`);
```

Зачем: текст чанка часто «без контекста» (кусок таблицы «Бариста — 2 чел» не говорит, про какой бизнес и какую тему). Путь заголовков (`Кофейня > Персонал > Найм и обучение`) даёт вектору тему ниши и блока — релевантность при поиске растёт. В БД текст хранится как есть, путь добавляется только на вход модели.

Запрос к Jina:

```ts
// scripts/embeddings/embed.ts — fetchEmbeddings()
body: JSON.stringify({
  model: EMBED_CONFIG.model,
  task: 'retrieval.passage', // документная сторона поиска; для запроса будет retrieval.query
  dimensions: EMBED_CONFIG.dimensions,
  normalized: true, // нормировка → similarity через скалярное произведение
  input: inputs,
}),
```

`task=retrieval.passage` — Jina строит вектор под «документ», который ищут; на этапе поиска тот же запрос с тем же эмбеддингом запроса должен идти с `task=retrieval.query`. Смешивать нельзя — вектора разных task несопоставимы.

Запись — по айдишнику чанка, идемпотентна:

```ts
// scripts/embeddings/embed.ts
pool.query(`update chunks set embedding = $1::vector where chunk_id = $2`, [
  `[${vectors[j].join(',')}]`,
  batch[j].chunk_id,
]);
```

Не тронуто: схема БД, чанкование, `load.ts` (только локальный `withRetry` заменён на импорт из общей либы).

## 4. UI

Не применимо — консольный скрипт, запускается вручную.

## 5. Поток данных

```
npm run embed -- --apply
↓
SELECT chunk_id, text, heading_path, (embedding IS NOT NULL) FROM chunks
↓
filter → todo: только чанки без эмбеддинга
↓
батчи по 32: heading_path + text → fetchEmbeddings() → POST api.jina.ai/v1/embeddings
↓
number[][] — 1024-мерные вектора (порядок восстанавливается по index из ответа)
↓
UPDATE chunks SET embedding = $1::vector WHERE chunk_id = $2
↓
пауза 500 мс → следующий батч → «Готово: записано N чанков»
```

Функции: `main()` — флаги, env-проверки, пул Neon, оркестрация; `fetchEmbeddings(inputs, apiKey)` — батч строк → массив векторов; `withRetry(label, fn)` — до 3 попыток с паузой 1с → 2с → 4с, общий для всех скриптов.

## 6. Почему так, а не иначе

1. `heading_path` в входе эмбеддинга — contextual retrieval: без него вектор «не знает» тему чанка. Хранить гибрид (путь+текст) в отдельной колонке не стали — путь и так лежит в `chunks.heading_path`, склеивание на лету дешевле.
2. `task=retrieval.passage` + одна модель в конфиге — вектора документа и запроса должны быть из одной модели и совместимых task; точка смены модели одна.
3. Dry-run по умолчанию + пропуск чанков с готовым эмбеддингом — повторный запуск докатывает только новых (и сброшенных после правки текста в `chunk:load`), не жжёт токены.
4. `withRetry` в `scripts/lib/retry.ts`, а не копия в каждом скрипте — один паттерн ретраев для `chunk:load` и `embed`.

## Преимущества

- ✅ Идемпотентно: повторный запуск обрабатывает только чанки без вектора
- ✅ Одна точка смены модели/размерности — config
- ✅ Dry-run защищает от случайной записи и лишних трат токенов
- ✅ Единый retry для всех скриптов проекта
