# Заметка: команды этапа чанкования

Дополнение к `03-chunking-plan.md`. Краткая шпаргалка: какие команды есть, что каждая делает, в каком порядке запускать.

## Общая картина

Конвейер подготовки знаний для RAG (этапы 1–3 из `01-rag-plan.md`):

```
docs/source/RAG-документация_BusiVerse.raw.md      (исходник, не трогаем)
        │  план 2 — очистка текста (выполнена ранее)
        ▼
RAG-документация_BusiVerse.md                      (очищенный markdown)
        │  npm run chunk        — нарезка на чанки
        ▼
data/chunks/<группа>/<раздел>/<chunk_id>.json      (дерево папок, правится руками)
data/chunking-report.md                            (отчёт прогона)
        │  npm run chunk:validate --apply?  нет — валидатор всегда читает файлы
        │  npm run chunk:load --apply       — запись в БД (только вручную!)
        ▼
Postgres: таблицы sources / chunks / chunk_links
        │  npm run embed --apply             — эмбеддинги чанков (только вручную!)
        ▼
Postgres: chunks.embedding (vector 1024)
```

## Команды

### `npm run chunk` — нарезка

Точка входа: `scripts/chunking/chunk.ts`.

- Читает очищенный файл (`CONFIG.inputPath`).
- Разбирает структуру (группы → разделы → блоки), классифицирует заголовки (`lib/classify.ts`), проверяет структуру (`assertStructure`).
- Нарезает блоки на чанки по правилам дробления (`lib/split.ts`): секции-родители, преамбула, таблицы с шапкой в каждом куске, кейсы/SOP/чек-листы целиком.
- Извлекает ссылки между разделами (`lib/links.ts`).
- Пишет дерево папок с JSON-файлами чанков + `_links.json` (`lib/emit.ts`) и отчёт `data/chunking-report.md`.
- **БД не трогает** — ни не читает, ни не пишет. `DATABASE_URL` не нужен.

Повторный запуск полностью перезаписывает `data/chunks` — ручные правки JSON затираются, поэтому правки делают после финального прогона.

### `npm run chunk:validate` — проверка

Точка входа: `scripts/chunking/lib/validate.ts`.

- Обходит всё дерево `data/chunks` и проверяет **каждый** чанк:
  - бюджет токенов (500–700; кейсы/SOP/чек-листы могут превышать);
  - у куска таблицы шапка стоит непосредственно перед первой строкой данных;
  - ссылки (`_links.json`) указывают на существующие разделы;
  - обязательные поля JSON заполнены.
- Печатает список проблем или `OK — все проверки зелёные`. Exit-код 1 при ошибках.

Запускать после каждого прогона `chunk` и после ручных правок JSON.

### `npm run chunk:load` — запись в БД

Точка входа: `scripts/chunking/load.ts`. Запускает **только пользователь вручную**, требует `DATABASE_URL`.

- **По умолчанию dry-run**: читает `data/chunks`, печатает план (сколько чанков и ссылок будет записано) и ничего не пишет.
- **С флагом `--apply`** выполняет запись:
  1. upsert источника в `sources` (id, название, версия, хеш содержимого);
  2. upsert каждого чанка в `chunks` по `chunk_id` (при изменении текста `embedding` сбрасывается в `NULL` — пересчитает следующий этап);
  3. вставка ссылок в `chunk_links` (`on conflict do nothing`).
- Каждый запрос обёрнут в retry: до **3 попыток** с паузой 1с → 2с → 4с; каждая неудачная попытка логируется с id чанка. Если все 3 исчерпаны — скрипт падает с ошибкой вида `chunk <id>: не удалось после 3 попыток — <причина>`.
- Все записи идемпотентны (upsert): после сбоя на середине повторный `--apply` спокойно докатывает остаток, дублей не будет.

### `npm run embed` — эмбеддинги чанков

Точка входа: `scripts/embeddings/embed.ts`. Запускает **только пользователь вручную**, требует `DATABASE_URL` и `EMBEDING_API_JINA` (ключ Jina AI, в `.env.local`).

- Читает из БД все чанки без эмбеддинга (`embedding IS NULL`).
- Для каждого берёт `heading_path + текст` (contextual retrieval, план 1, раздел 6.2) и отправляет батчами по 32 в Jina: модель `jina-embeddings-v5-omni-small`, 1024 размерности — под `vector(1024)` в схеме.
- Записывает `UPDATE chunks SET embedding = ... WHERE chunk_id = ...`.
- **По умолчанию dry-run**: печатает, сколько чанков уйдёт в Jina, и ничего не пишет. Запись — с флагом `--apply`.
- Чанки с готовым эмбеддингом пропускаются: повторный запуск докатывает только новые и сброшенные (после изменения текста в `chunk:load`).
- Retry как у загрузчика: до 3 попыток с паузой 1с → 2с → 4с.

### `npm run test:chunking` — тесты

Точка входа: `scripts/chunking/test/chunking.test.ts`. Юнит-тесты парсера, классификатора, дробления и подсчёта токенов (13 тестов). БД не требует.

### `npm run retrieve` — ручная проверка retrieval

Точка входа: `retrieval/run.ts`. Запускает **только пользователь вручную**, требует `DATABASE_URL`, `EMBEDING_API_JINA` и `ZAI_API_KEY` (в `.env.local`); `RERANKER_API_JINA` — опциональный отдельный ключ для rerank.

```bash
npm run retrieve -- "как открыть кофейню"                     # читаемый вывод
npm run retrieve -- "как открыть кофейню" --niche coffee_shop # ниша передана напрямую
npm run retrieve -- "как открыть кофейню" --json              # полный результат в JSON
```

- Запрос передаётся позиционным аргументом после `--` (несколько слов склеиваются в одну строку).
- Флаги: `--niche <код>` — пропустить классификатор и искать в заданной нише; `--json` — вывести весь `RetrievalResult` (context + chunks + meta) машинно-читаемо.
- Коды ниш: `coffee_shop`, `pickup_point`, `mini_bakery`, `manicure_studio`, `auto_service`, `marketplace_seller`, `online_school`, `smm_agency`, `own_online_store`, `remote_accounting`.
- Что делает (план 6): определяет нишу (переданная → fulltext-проба по словарю → LLM `glm-5.3-flash`), эмбеддит запрос (Jina, `retrieval.query`), параллельно гонит vector-поиск и FTS (по 40 кандидатов), сливает через RRF (топ-20), переранживает (`jina-reranker-v3.5`, топ-8), достаёт блоки целиком + родительские секции + связанные разделы, собирает контекст в бюджет 12 000 токенов.
- Вывод без `--json`: блок `meta` (ниша и способ её определения, счётчики vector/fts/rrf/rerank/context, флаг обрезки по бюджету) и собранный контекст с заголовками-источниками.
- БД **только читает** — чанки, эмбеддинги и ссылки должны быть загружены заранее (`chunk:load --apply`, `embed --apply`).
- Отказоустойчивость: все сетевые вызовы и SQL обёрнуты в retry (3 попытки, 1с → 2с → 4с). Падение rerank, эмбеддинга или БД роняет команду с ошибкой; падение классификатора — нет (поиск продолжается без фильтра ниши).
- Отсутствующая env-переменная печатается с пояснением, для чего она нужна.

## Порядок работы

```bash
npm run chunk            # 1. нарезка → data/chunks + отчёт
npm run chunk:validate   # 2. проверка (правим и повторяем 1–2, пока не зелёное)
npm run test:chunking    #    (по желанию, после правок lib/)
npm run chunk:load       # 3. dry-run: смотрим план
npm run chunk:load --apply  # 4. реальная запись в БД
npm run embed            # 5. dry-run: сколько чанков уйдёт в Jina
npm run embed -- --apply    # 6. эмбеддинги → chunks.embedding
npm run retrieve -- "запрос"   # 7. ручная проверка поиска (читает БД, ничего не пишет)
```

## Что сделано и что дальше

Сделано: очистка текста (план 2), нарезка + дерево папок + родители/ссылки (план 3), валидатор, загрузчик в БД с retry, эмбеддинги через Jina, retrieval-конвейер с CLI-проверкой (план 6, папка `retrieval/`).

Дальше (по `01-rag-plan.md`): заполнение `topics` (частотные термины + LLM-нормализация), поиск (tsv + pgvector) и API.


## 🧪 Eval (Тестирование качества retrieval)

### CLI запуск

```bash
# Запустить eval для всех вопросов
npm run eval

# Ограничить количество вопросов
npm run eval:limit 10

# Сохранить результаты в JSON
npm run eval:json

# Комбинация
tsx retrieval/eval/runner/runner.ts --limit 5 --json
```

### Программный запуск

```typescript
import { runEval } from './retrieval/eval';

// Запуск с опциями
await runEval({
  questionsPath: './custom-questions.jsonl',
  limit: 10,
  outputJson: true
});

// Только eval функция
import { evalRetrieve } from './retrieval/eval/evalFunction';

const result = await evalRetrieve({
  query: 'Как настроить бухгалтерский учет?',
  niche: 'accounting',
  expected_chunk_ids: ['accounting-1-2-b01']
});

// Вычисление метрик
import { calculateMetrics } from './retrieval/eval/runner/metrics';

const metrics = calculateMetrics(
  'q001',
  'Test question',
  'easy',
  ['chunk1', 'chunk2'],
  ['chunk1', 'chunk3']
);
```

### Метрики

- **Precision** = TP / (TP + FP) — доля правильных среди найденных
- **Recall** = TP / (TP + FN) — доля найденных среди правильных  
- **F1** = 2 × (Precision × Recall) / (Precision + Recall)
- **Perfect Match** — все expected найдены, лишних нет

Агрегация по сложности (easy, medium, hard) и типу (niche, global, hard)
