# Eval-кит retrieval (план 05)

Документ описывает систему измерения качества поиска: как устроен eval-режим retrieval, что именно он проверяет, как считаются метрики и как запускать прогоны. Код живёт в `retrieval/eval/` — это часть retrieval-модуля, но с отдельной точкой входа и собственным датасетом.

```
retrieval/eval/questions.jsonl        (45 вопросов с golden-разметкой)
   │
   ▼
┌────────────────────────────────────────────────────────────────────┐
│ runner.ts: loadQuestions → для каждого вопроса:                    │
│   evalRetrieve (полный pipeline шагов 1–8, только chunk_id)        │
│   → calculateMetrics (P / R / F1 / perfect match)                  │
│ → aggregateMetrics (средние + разбивка по difficulty и group)      │
│ → stdout-отчёт + eval-results.json (флаг --json)                   │
└────────────────────────────────────────────────────────────────────┘
```

Eval отвечает на один вопрос: **«находит ли поиск правильные чанки?»**. Генерация ответа LLM, faithfulness и качество формулировок — за пределами этого кита (см. раздел «Ограничения»).

## Структура папки

```
retrieval/eval/
  index.ts                 ← публичный API: реэкспорт всего кита
  questions.jsonl          ← датасет: 45 вопросов, одна строка JSON = один вопрос
  evalFunction/            ← слой 1: «что вернул поиск»
    eval.ts                ← evalRetrieve: прогон запроса через pipeline шагов 1–8
    eval.types.ts          ← EvalRetrieveInput / EvalRetrievalResult / EvalCounters
    index.ts               ← реэкспорт
  runner/                  ← слой 2: «насколько это хорошо»
    runner.ts              ← runEval: цикл по вопросам + CLI-точка входа
    runner.types.ts        ← EvalQuestion / EvalMetrics / AggregatedMetrics / ...
    loaders.ts             ← loadQuestions: чтение JSONL
    metrics.ts             ← calculateMetrics: precision / recall / F1 / perfect match
    aggregation.ts         ← aggregateMetrics: средние + группировки
    formatters.ts          ← pct + печать агрегированного отчёта
```

Слои не зависят друг от друга: `evalFunction` не знает про метрики, `runner` не знает про устройство pipeline — он получает готовый `EvalRetrievalResult`.

## Архитектура: два слоя

### Слой 1 — `evalRetrieve` (evalFunction/eval.ts)

**Файлы:** `evalFunction/eval.ts` + `eval.types.ts`.

**Вход:** `EvalRetrieveInput { query, niche?, expected_chunk_ids?, expected_section?, expected_sections? }`.
**Выход:** `EvalRetrievalResult` — те же ожидания + найденные chunk_id + счётчики этапов.

Функция выполняет **тот же pipeline, что и продовый `retrieve()`** (шаги 1–8 из `retrieval-pipeline.md`): валидация → определение ниши → эмбеддинг запроса → vector ∥ FTS → RRF → rerank → small-to-big. Отличие одно: вместо сборки контекста (шаги 9–10) она извлекает **только список chunk_id** — этого достаточно, чтобы сравнить результат поиска с golden-разметкой.

```ts
const [vectorHits, ftsHits] = await Promise.all([
  vectorSearch(vector, decision.niche, SEARCH_CONFIG.topK),
  ftsSearch(query, decision.niche, SEARCH_CONFIG.topK),
]);

const fused = fuseRrf([vectorHits, ftsHits]);
const top = await rerank(query, fused);
const groups = await expandHits(top);

const retrievedChunkIds = extractChunkIds(groups);
```

#### Ключевое решение: только `block.parts`, без parent и links

```ts
function extractChunkIds(groups: Awaited<ReturnType<typeof expandHits>>): string[] {
  const ids = new Set<string>();

  for (const group of groups) {
    // Собираем chunk_id ТОЛЬКО из основного блока
    for (const part of group.block.parts) {
      ids.add(part.chunk_id);
    }
    // НЕ добавляем parent.parts — это контекст для LLM, не часть eval golden standard
    // НЕ добавляем links.parts — это cross-references, которых нет в expected
  }

  return Array.from(ids);
}
```

Почему это правильно:

- **Expected в `questions.jsonl` содержит только листовые блоки** — те самые `coffee_shop-1.3-b01-p1`, которые нарезал чанкер. Родительская секция (`coffee_shop-1.3`) и связанные разделы — это «необходимый шум» для LLM (контекст, чтобы модель поняла мысль целиком), но не часть golden standard для поиска.
- **Eval измеряет точность попадания в ключевые блоки, а не архитектуру контекста.** Если бы parent и links попали в `retrieved_chunk_ids`, каждый вопрос автоматически получил бы ложные срабатывания (FP) — метрики измеряли бы дизайн expand, а не качество поиска.
- **`Set` убирает дубликаты:** один и тот же chunk может встретиться в `parts` нескольких групп (несколько хитов указали на один блок) — в метриках он должен считаться один раз.

#### Счётчики этапов (`EvalCounters`)

Каждый результат несёт счётчики по всем этапам воронки — по ним видно, **где** теряются правильные чанки:

```ts
counters: {
  vector: number;          // кандидатов из pgvector (topK = 40)
  fts: number;             // кандидатов из fulltext-поиска (topK = 40)
  rrf: number;             // после слияния RRF (topK = 20)
  rerank: number;          // после переранжирования (topK = 5)
  expanded_groups: number; // групп после small-to-big (дедуп блоков)
  total_chunks: number;    // уникальных chunk_id в retrieved
}
```

Диагностика по счётчикам: `fts = 0` при непустом запросе → FTS-плечо не сработало (проверить tsquery); `rrf` сильно меньше `vector + fts` → плечи находят одни и те же чанки; правильный чанк есть в `vector`, но пропал после `rerank` → проблема в cross-encoder, а не в поиске.

#### Логирование

`evalRetrieve` печатает по каждому вопросу блок: запрос, нишу и способ её определения (`niche_source`), expected-чанки, retrieved-чанки, expected-секции и счётчики. Это позволяет глазами проверить любой вопрос без чтения JSON.

### Слой 2 — `runEval` (runner/)

**Файлы:** `runner/runner.ts` + `loaders.ts` + `metrics.ts` + `aggregation.ts` + `formatters.ts`.

**Вход:** `RunEvalOptions { questionsPath?, limit?, outputJson? }`.
**Выход:** агрегированный отчёт в stdout + опционально `retrieval/eval/eval-results.json`.

Поток:

```
loadQuestions(questions.jsonl)          ← JSONL → EvalQuestion[]
        │  (опционально slice(0, limit))
        ▼
для каждого вопроса (последовательно):
   evalRetrieve({ query, niche, expected_* })   ← слой 1
   calculateMetrics(qid, question, difficulty, expected, retrieved)
        │  (ошибка одного вопроса НЕ роняет прогон — логируется и пропускается)
        ▼
aggregateMetrics(results)               ← средние + by_difficulty + by_group
        ▼
printAggregatedMetrics(agg)             ← отчёт в stdout
        │  (флаг --json)
        ▼
eval-results.json                       ← timestamp + aggregated + по-вопросные результаты
```

Два важных свойства:

- **Отказоустойчивость прогона.** Ошибка на одном вопросе (недоступна БД на секунду, API вернул мусор) пишется в stderr как `✗ Error: ...`, вопрос пропускается — прогон продолжается. Падает только фатальная ошибка (нет `DATABASE_URL` и т.п.).
- **Последовательный обход.** Вопросы обрабатываются по одному, не параллельно: лог читается сверху вниз, а нагрузка на БД и API предсказуема.

## Датасет: `questions.jsonl`

### Формат строки

| Поле | Тип | Что это |
|---|---|---|
| `qid` | string | Стабильный id: `q-<niche\|global\|hard>-NN`. На него ссылаются результаты прогонов — менять нельзя |
| `group` | enum | `niche` / `global` / `hard` |
| `business_type` | string \| null | Код ниши (`coffee_shop`, ...). `null` — сквозные и hard-вопросы без ниши |
| `question` | string | Текст вопроса на русском |
| `question_style` | enum | `colloquial` (разговорный) / `terminology` (с терминами документа) |
| `content_type` | enum | `table` / `case` / `sop` / `checklist` / `prose` / `mixed` — тип чанка, который должен ответить |
| `expected_chunk_ids` | string[] | 1–3 реальных `chunk_id` из БД. Пустой массив только для `unanswerable` |
| `expected_section` | string \| null | Основной `section_code` (`"1.3"`, `"B0.2"`) |
| `expected_sections` | string[] | Все секции, релевантные ответу |
| `difficulty` | enum | `easy` / `medium` / `hard` |
| `unanswerable` | boolean | `true` — ответа в документе нет; проверка, что ассистент не выдумывает |
| `notes` | string | Почему размечено именно так, подводный камень |

Пример строки:

```json
{"qid":"q-niche-01","group":"niche","business_type":"coffee_shop",
 "question":"Сколько денег нужно на старт кофейни навынос в Москве и сколько она приносит в базовом сценарии?",
 "question_style":"colloquial","content_type":"table",
 "expected_chunk_ids":["coffee_shop-1.3-b01-p1","coffee_shop-1.3-b01-p2"],
 "expected_section":"1.3","expected_sections":["1.3"],
 "difficulty":"easy","unanswerable":false,
 "notes":"Лист «Кофейня (Москва)»: CapEx в p1, прибыль по сценариям в p2"}
```

### Состав набора (45 вопросов)

| Разрез | Разбивка |
|---|---|
| Группы | `niche` — 30 (по 3 на каждую из 10 ниш), `global` — 10 (сквозные разделы), `hard` — 5 |
| Сложность | `easy` — 26, `medium` — 14, `hard` — 5 |
| Стиль | `colloquial` — 28, `terminology` — 17 |
| Тип контента | `table` — 25, `case` — 10, `sop` — 7, `checklist` — 1, `prose` — 1, `mixed` — 1 |
| Ожидаемых чанков | 1 чанк — 36 вопросов, 2 чанка — 8, 0 (unanswerable) — 1 |
| `unanswerable` | 1 (вопрос H5 — темы нет в документе) |

Два уровня разметки — чанки и секции — не дублирование, а страховка: метрики по чанкам хрупки к пересборке чанкинга (id меняются при передроблении), метрики по секциям — нет. Сейчас метрики считаются по чанкам; секции сохранены в результате для будущих устойчивых сравнений.

Стиль `colloquial`/`terminology` — сознательная пара к гибридному поиску: разговорные вопросы проверяют vector-плечо, терминологические («152-ФЗ», «ст. 14.5 КоАП») — fulltext-плечо. Если деградирует одно из двух плеч, это видно по разбивке метрик.

## Метрики

**Файл:** `runner/metrics.ts` — `calculateMetrics(qid, question, difficulty, expected, retrieved)`.

Сравнение множественное (set-based): порядок найденных чанков не учитывается, важны только совпадения множеств `expected` и `retrieved`.

```
expected  = ['chunk1', 'chunk2', 'chunk3']     // правильные чанки из questions.jsonl
retrieved = ['chunk1', 'chunk2', 'chunk4']     // block.parts из expandHits

True Positives (TP) = 2   → chunk1, chunk2 (нашли и они правильные)
False Positives (FP) = 1  → chunk4 (нашли, но он лишний)
False Negatives (FN) = 1  → chunk3 (не нашли, хотя надо было)

Precision = TP / (TP + FP) = 2/3 ≈ 66.7%   → из найденных правильные
Recall    = TP / (TP + FN) = 2/3 ≈ 66.7%   → из нужных найдены
F1        = 2·P·R / (P + R)      ≈ 66.7%   → баланс
```

Код:

```ts
const expectedSet = new Set(expected);

let truePositives = 0;
let falsePositives = 0;

for (const chunkId of retrieved) {
  if (expectedSet.has(chunkId)) truePositives++;
  else falsePositives++;
}

const falseNegatives = expected.length - truePositives;

const precision = retrieved.length > 0 ? truePositives / retrieved.length : 0;
const recall = expected.length > 0 ? truePositives / expected.length : 0;
const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

const perfectMatch = truePositives === expected.length && falsePositives === 0;
```

- **Precision** штрафует за шум: сколько из принесённого в контекст действительно нужно. Важен для бюджета контекста — лишние чанки съедают токены и путают модель.
- **Recall** штрафует за пропуски: нашли ли всё, что нужно для ответа. Для RAG это главная метрика — ненайденный факт модель не придумает корректно.
- **`perfect_match`** — строгий бинарный флаг: все expected найдены и лишних нет. Доля perfect matches по прогону — самая наглядная «оценка сверху».

### Особые случаи

- **Пустой `retrieved`** (поиск ничего не вернул): precision = 0, recall = 0, F1 = 0 — вопрос честно падает в ноль, а не выпадает из статистики.
- **`unanswerable`-вопрос (H5)**: `expected = []` → любой найденный чанк становится FP, recall = 0 по формуле. Сейчас такой вопрос тянет средние вниз — это известное упрощение; корректная обработка («поиск должен вернуть пусто») — задача следующего шага, см. «Ограничения».

## Агрегация

**Файл:** `runner/aggregation.ts` — `aggregateMetrics(results)`.

Считается три среза:

1. **Общий** — `total_questions`, `perfect_matches`, средние precision / recall / F1 по всем вопросам.
2. **По сложности** (`by_difficulty`) — те же статистики отдельно для `easy` / `medium` / `hard`. Так видно, где поиск проседает: если `easy` даёт F1 = 0.9, а `hard` — 0.3, проблема в сложных формулировках, а не в базовом поиске.
3. **По группе** (`by_group`) — отдельно `niche` / `global` / `hard`. Деградация на `global` указывает на фильтр ниши (сквозные чанки должны быть видны всегда), на `niche` — на классификацию или нишевый корпус.

Структура `AggregatedMetrics`:

```ts
{
  total_questions: number;
  perfect_matches: number;
  avg_precision: number;
  avg_recall: number;
  avg_f1: number;
  by_difficulty: Record<string, DifficultyStats>;  // count, avg_*, perfect_matches
  by_group: Record<string, GroupStats>;            // та же структура
}
```

Отчёт в stdout (`formatters.ts`):

```
📈 AGGREGATED METRICS
================================================================
Total questions: 45
Perfect matches: 31 (68.9%)

Average Precision: 82.4%
Average Recall:    79.1%
Average F1:        80.2%

----------------------------------------------------------------
By Difficulty:
  easy      (n=26): P=88.5%, R=86.2%, F1=87.1%, perfect=20
  medium    (n=14): P=74.1%, R=69.8%, F1=71.3%, perfect=9
  hard      (n=5):  P=52.0%, R=48.0%, F1=49.4%, perfect=2

----------------------------------------------------------------
By Group:
  niche     (n=30): P=85.2%, R=82.7%, F1=83.6%, perfect=23
  global    (n=10): P=78.0%, R=74.0%, F1=75.4%, perfect=7
  hard      (n=5):  P=52.0%, R=48.0%, F1=49.4%, perfect=2
```

(числа иллюстративные — реальные получаются на прогоне)

## Результат прогона в JSON (`--json`)

```json
{
  "timestamp": "2026-11-05T12:00:00.000Z",
  "aggregated": { "...AggregatedMetrics..." },
  "results": [
    {
      "qid": "q-niche-01",
      "question": "Сколько денег нужно на старт кофейни навынос...",
      "metrics": {
        "precision": 1.0, "recall": 1.0, "f1": 1.0,
        "true_positives": 2, "false_positives": 0, "false_negatives": 0,
        "expected_count": 2, "retrieved_count": 2, "perfect_match": true
      },
      "retrieved_chunk_ids": ["coffee_shop-1.3-b01-p1", "coffee_shop-1.3-b01-p2"],
      "expected_chunk_ids": ["coffee_shop-1.3-b01-p1", "coffee_shop-1.3-b01-p2"]
    }
  ]
}
```

Файл пишется в `retrieval/eval/eval-results.json`, перезаписывается каждым прогоном с `--json`. По-вопросные `retrieved_chunk_ids` + `expected_chunk_ids` позволяют постфактум разобрать любой вопрос: какие чанки лишние (FP), какие пропали (FN) — не перезапуская прогон.

## Изменения retrieval-логики в этой ветке

Ветка `EvalTest` помимо eval-кита меняет два параметра боевого поиска — оба заточены под то, чтобы eval показывал честные цифры.

### 1. Rerank: `topK` 8 → 5

**Файл:** `retrieval/steps/rerank/rerank.config.ts`.

```ts
export const RERANK_CONFIG = {
  model: 'jina-reranker-v3.5',
  topK: 5,  // было 8, понижено для уменьшения шума в eval
} as const;
```

Что меняет: после rerank в small-to-big идут 5 хитов вместо 8. Меньше хитов → меньше групп → меньше лишних чанков в `retrieved_chunk_ids` → выше precision и меньше FP в метриках. Плата: чуть ниже потолок recall (меньше блоков-кандидатов на expand). Это классический trade-off точность/полнота, и eval теперь позволяет его **измерить**, а не угадывать: прогон с 5 и с 8 сравнивается по одной и той же датасету двумя командами.

### 2. FTS: мягкая логика OR вместо жёсткого AND

**Файл:** `retrieval/steps/search/fts.ts` — `buildTsQuery`.

Было: все термы запроса склеивались через ` & ` (логическое И) — чанк должен был содержать **каждый** терм запроса. Стало:

```ts
function buildTsQuery(query: string): string | null {
  const terms = query.toLowerCase().match(/[a-zа-яё0-9]+/g) ?? [];

  // Фильтруем стоп-слова (короткие предлоги и союзы)
  const stopWords = new Set([
    'в', 'и', 'на', 'с', 'по', 'для', 'от', 'к', 'из', 'у', 'о',
    'при', 'за', 'до', 'как', 'что', 'это', 'он', 'она', 'они', 'его', 'её', 'их',
  ]);
  const filtered = terms.filter(t => t.length >= 2 && !stopWords.has(t));

  if (filtered.length === 0) return null;

  // Префикс для кириллических слов >= минимальной длины
  const parts = filtered.map((t) =>
    /^[а-яё]+$/.test(t) && t.length >= SEARCH_CONFIG.ftsPrefixMinLength ? `${t}:*` : t,
  );

  // Используем OR (|) вместо AND (&) для более мягкого поиска
  // Документы, содержащие больше терминов, получат выше rank
  return parts.join(' | ');
}
```

Три изменения:

1. **Стоп-слова выбрасываются** (`как`, `и`, `что`, предлоги...). Раньше «как открыть кофейню» требовало от чанка содержать и «как» — слово, которого в деловом тексте может не быть.
2. **`&` → `|` (OR).** Раньше разговорный вопрос из 6–8 слов почти никогда не матчился целиком → FTS-плечо возвращало пусто → RRF вырождался в vector-only, и половина гибрида не работала. Теперь FTS возвращает кандидатов всегда, а `ts_rank` выстраивает их так, что документы с **большим числом совпавших термов** получают более высокий ранг — мягкость OR не убивает релевантность.
3. **Минимальная длина терма 2** — однобуквенные обрывки не попадают в tsquery.

Пример трансформации: «как открыть кофейню и какие налоги платить» → термы `[как, открыть, кофейню, и, какие, налоги, платить]` → стоп-слова `как`, `и` выброшены → tsquery `открыть:* | кофейню:* | какие:* | налоги:* | платить`.

Разбалансировка шума не страшна: лишних кандидатов от OR отсеивает rerank (cross-encoder), который стоит ровно для этого. В `fts.ts` также добавлено временное логирование `[FTS] query → tsQuery` и `[FTS] found N results` для отладки — убрать после стабилизации.

## Как запускать

### Требования

- `DATABASE_URL` — Neon Postgres с загруженными чанками и эмбеддингами (`chunk:load --apply`, `embed --apply`).
- `EMBEDING_API_JINA` — эмбеддинг запроса (шаг 3 pipeline).
- `ZAI_API_KEY` — классификатор ниши (glm-5.3-flash). Падение классификатора прогон не роняет — поиск идёт без фильтра ниши.
- `RERANKER_API_JINA` — опционально, отдельный ключ rerank (иначе общий с эмбеддингами).

### CLI

```bash
npm run eval            # все 45 вопросов, отчёт в stdout
npm run eval:limit 10   # первые 10 вопросов (быстрая проверка)
npm run eval:json       # + сохранить eval-results.json

# напрямую с флагами
npx tsx retrieval/eval/runner/runner.ts --limit 5 --json
```

### Программно

```typescript
// Полный прогон
import { runEval } from './retrieval/eval';

await runEval({
  questionsPath: './custom-questions.jsonl',  // свой датасет
  limit: 10,                                   // срез
  outputJson: true,                            // сохранить JSON
});

// Один вопрос через eval-режим retrieval
import { evalRetrieve } from './retrieval/eval/evalFunction';

const result = await evalRetrieve({
  query: 'Сколько денег нужно на старт кофейни навынос в Москве?',
  niche: 'coffee_shop',                        // опционально: пропустить классификатор
  expected_chunk_ids: ['coffee_shop-1.3-b01-p1', 'coffee_shop-1.3-b01-p2'],
  expected_sections: ['1.3'],
});
// result.retrieved_chunk_ids — что нашёл поиск
// result.counters — где сколько кандидатов на каждом этапе

// Метрики отдельно от pipeline (чистая арифметика, БД не нужна)
import { calculateMetrics } from './retrieval/eval/runner/metrics';

const metrics = calculateMetrics(
  'q-test', 'Тестовый вопрос', 'easy',
  ['chunk1', 'chunk2'],       // expected
  ['chunk1', 'chunk3'],       // retrieved
);
// { precision: 0.5, recall: 0.5, f1: 0.5, perfect_match: false, ... }
```

### Порядок в общем конвейере

Eval встаёт после полной загрузки данных — читает те же таблицы, что и `npm run retrieve`, ничего не пишет:

```bash
npm run chunk:load --apply      # чанки в БД
npm run embed -- --apply        # эмбеддинги
npm run eval                    # измерение качества поиска
```

## Ограничения и что дальше

| Что отсутствует | Почему | Когда добавлять |
|---|---|---|
| Ранговые метрики (`recall@5`, `MRR`, `nDCG@10`) | Текущие метрики set-based — порядок не учитывается. Для ранговых нужен сохранённый ранг каждого найденного чанка | Следующий шаг; формат `eval-results.json` расширяется без переделки runner'а |
| Корректная обработка `unanswerable` | Сейчас H5 тянет средние вниз (см. «Особые случаи» метрик) | Вместе с ранговыми метриками |
| Валидатор датасета (план 05, раздел 6) | Схема + ссылочная целостность + чек-лист покрытия | До подключения в CI |
| LLM-as-judge (faithfulness, relevancy, citation) | Нужен работающий генератор ответа — eval-кит пока измеряет только retrieval | Отдельный план |
| Метрики по `expected_sections` | Секции сохраняются в результате, но не участвуют в `calculateMetrics` | Как устойчивая альтернатива чанкам при пересборке чанкинга |

Связанные документы: `docs/plan/05-eval-kit-plan.md` (исходный план), `docs/feature/retrieval-pipeline.md` (устройство pipeline, который прогоняет eval), `docs/plan/Script-commands.md` (шпаргалка команд).
