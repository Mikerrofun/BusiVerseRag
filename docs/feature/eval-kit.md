---

**Дата:** 05.11.2026
**Теги:** #features #retrieval #eval #rag

---

## 1. Зачем

Pipeline retrieval (8 шагов) менялся вслепую: понизили `topK` rerank, переписали логику FTS — и никто не мог сказать, стало лучше или хуже. Метрик качества поиска не было вообще: находит ли поиск правильные чанки, на каком этапе их теряет — неизвестно, проверялось глазами через `npm run retrieve`.

План 05 (eval-kit) это закрывает: датасет из 45 вопросов с golden-разметкой + раннер, который прогоняет каждый вопрос через боевой pipeline и считает precision / recall / F1. Теперь любое изменение поиска проверяется прогоном одной команды, а не на глаз.

## 2. Где/что уже было

Задача была не писать новый поиск, а обернуть существующий в eval-режим. Переиспользовано всё:

- боевой `retrieve()` — шаги 1–8: валидация → ниша → эмбеддинг → vector ∥ FTS → RRF → rerank → small-to-big. `evalRetrieve` вызывает те же функции шагов, а не свою копию;
- `SEARCH_CONFIG`, `RERANK_CONFIG`, `fuseRrf`, `expandHits` — без изменений;
- датасет `retrieval/eval/questions.jsonl` (45 вопросов с разметкой) и план `docs/plan/05-eval-kit-plan.md` — уже были влиты в main из ветки EvelKit (PR #8).

Нового писалось только два слоя: обёртка над pipeline (`evalFunction/`) и арифметика метрик + раннер (`runner/`).

## 3. Реализация

```
retrieval/eval/
  index.ts                 ← публичный API: реэкспорт всего кита
  questions.jsonl          ← датасет: 45 вопросов, строка JSON = вопрос
  evalFunction/            ← слой 1: «что вернул поиск»
    eval.ts                ← evalRetrieve + extractChunkIds
    eval.types.ts          ← EvalRetrieveInput / EvalRetrievalResult / EvalCounters
  runner/                  ← слой 2: «насколько это хорошо»
    runner.ts              ← runEval: цикл по вопросам + CLI-точка входа
    runner.types.ts        ← EvalQuestion / EvalMetrics / AggregatedMetrics
    loaders.ts             ← loadQuestions: чтение JSONL
    metrics.ts             ← calculateMetrics: P / R / F1 / perfect match
    aggregation.ts         ← aggregateMetrics: средние + группировки
    formatters.ts          ← pct + печать отчёта
```

Слои независимы: `evalFunction` не знает про метрики, `runner` не знает про устройство pipeline — получает готовый `EvalRetrievalResult`.

### evalRetrieve — eval-режим pipeline

```ts
// retrieval/eval/evalFunction/eval.ts
export async function evalRetrieve(input: EvalRetrieveInput): Promise<EvalRetrievalResult> {
  // те же шаги, что в боевом retrieve():
  const [vectorHits, ftsHits] = await Promise.all([
    vectorSearch(vector, decision.niche, SEARCH_CONFIG.topK),   // 40 кандидатов
    ftsSearch(query, decision.niche, SEARCH_CONFIG.topK),       // 40 кандидатов
  ]);
  const fused = fuseRrf([vectorHits, ftsHits]);                 // → 20
  const top = await rerank(query, fused);                       // → 5
  const groups = await expandHits(top);                         // small-to-big

  return {
    ...input,
    retrieved_chunk_ids: extractChunkIds(groups),
    counters: { vector, fts, rrf, rerank, expanded_groups, total_chunks },
  };
}
```

Принимает `{ query, niche?, expected_chunk_ids?, expected_section?, expected_sections? }`, отдаёт найденные chunk_id + счётчики этапов. Отличия от боевого `retrieve()`:

- вместо сборки контекста (шаги 9–10) — только список chunk_id: для сравнения с golden-разметкой больше ничего не нужно;
- падение классификатора ниши не роняет вызов — поиск идёт без фильтра ниши;
- печатает по каждому вопросу блок: запрос, ниша и способ её определения, expected vs retrieved, счётчики.

### extractChunkIds — только block.parts

```ts
// retrieval/eval/evalFunction/eval.ts
function extractChunkIds(groups): string[] {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const part of group.block.parts) {
      ids.add(part.chunk_id);        // только основной блок
    }
    // parent.parts НЕ добавляем — это контекст для LLM, не golden standard
    // links.parts НЕ добавляем — cross-references отсутствуют в expected
  }
  return Array.from(ids);            // Set убирает дубли чанка между группами
}
```

`expected_chunk_ids` в датасете содержат только листовые блоки (`coffee_shop-1.3-b01-p1`) — то, что нарезал чанкер. Родительская секция и связанные разделы — «необходимый шум» для LLM, но не часть golden standard: если бы они попали в retrieved, каждый вопрос получал бы автоматические FP, и метрики измеряли бы дизайн expand, а не качество поиска.

### Счётчики этапов — где теряются чанки

```ts
// retrieval/eval/evalFunction/eval.types.ts
counters: {
  vector: number;          // кандидатов из pgvector (topK = 40)
  fts: number;             // кандидатов из fulltext (topK = 40)
  rrf: number;             // после слияния RRF (topK = 20)
  rerank: number;          // после переранжирования (topK = 5)
  expanded_groups: number; // групп после small-to-big
  total_chunks: number;    // уникальных chunk_id в retrieved
}
```

Диагностика: `fts = 0` при непустом запросе → FTS-плечо не сработало; правильный чанк есть в `vector`, но пропал после `rerank` → проблема в cross-encoder, а не в поиске.

### calculateMetrics — precision / recall / F1

```ts
// retrieval/eval/runner/metrics.ts
const expectedSet = new Set(expected);
let truePositives = 0, falsePositives = 0;
for (const chunkId of retrieved) {
  if (expectedSet.has(chunkId)) truePositives++;
  else falsePositives++;
}
const falseNegatives = expected.length - truePositives;
const precision = retrieved.length > 0 ? truePositives / retrieved.length : 0;
const recall    = expected.length > 0 ? truePositives / expected.length : 0;
const f1        = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
const perfectMatch = truePositives === expected.length && falsePositives === 0;
```

Сравнение множественное (set-based): порядок не учитывается, важны только совпадения множеств.

```
expected  = ['chunk1', 'chunk2', 'chunk3']
retrieved = ['chunk1', 'chunk2', 'chunk4']

TP = 2 (chunk1, chunk2)   FP = 1 (chunk4)   FN = 1 (chunk3)
Precision = 2/3 ≈ 66.7%   → из найденного правильное (шум съедает токены контекста)
Recall    = 2/3 ≈ 66.7%   → из нужного найдено (главная метрика: ненайденный факт модель не вернёт)
F1        = 2·P·R/(P+R) ≈ 66.7%
perfect_match = false     → строгий флаг: всё найдено и лишнего нет
```

Особые случаи: пустой `retrieved` → все метрики в 0 (вопрос честно падает в ноль, а не выпадает из статистики); `unanswerable`-вопрос H5 (`expected = []`) → любой найденный чанк становится FP и тянет средние вниз — известное упрощение, корректная обработка в roadmap.

### aggregateMetrics — три среза

```ts
// retrieval/eval/runner/aggregation.ts
{
  total_questions, perfect_matches, avg_precision, avg_recall, avg_f1,
  by_difficulty: Record<'easy'|'medium'|'hard', {count, avg_*, perfect_matches}>,
  by_group:      Record<'niche'|'global'|'hard',  {count, avg_*, perfect_matches}>,
}
```

Зачем группировки: `easy` F1 = 0.9 при `hard` = 0.3 → проблема в сложных формулировках, а не в базовом поиске; деградация на `global` → фильтр ниши режет сквозные чанки, на `niche` → классификация или нишевый корпус.

### runEval — раннер

```ts
// retrieval/eval/runner/runner.ts
await runEval({ questionsPath?, limit?, outputJson? });
```

Последовательный цикл по вопросам: `loadQuestions` → `evalRetrieve` → `calculateMetrics` → `aggregateMetrics` → отчёт в stdout. Ошибка одного вопроса пишется в stderr и вопрос пропускается — прогон не роняется; фатальная ошибка (нет `DATABASE_URL`) падает. С флагом `--json` пишется `retrieval/eval/eval-results.json`: timestamp + агрегаты + по-вопросные `expected_chunk_ids` / `retrieved_chunk_ids` — разбор FP/FN постфактум, без перезапуска.

Запуск: `npm run eval` (все 45), `npm run eval:limit 10`, `npm run eval:json`. Требует `DATABASE_URL`, `EMBEDING_API_JINA`, `ZAI_API_KEY`; `RERANKER_API_JINA` опционален.

### Датасет: формат строки questions.jsonl

| Поле | Что это |
|---|---|
| `qid` | Стабильный id `q-<niche\|global\|hard>-NN`, на него ссылаются результаты — менять нельзя |
| `group` | `niche` (30, по 3 на нишу) / `global` (10, сквозные) / `hard` (5) |
| `business_type` | Код ниши или `null` для сквозных/hard |
| `question` | Текст вопроса на русском |
| `question_style` | `colloquial` (28) / `terminology` (17) — пара к гибриду: разговорные проверяют vector-плечо, терминологические («152-ФЗ») — FTS-плечо |
| `content_type` | `table` (25) / `case` (10) / `sop` (7) / `checklist` / `prose` / `mixed` |
| `expected_chunk_ids` | 1–2 реальных chunk_id; пустой массив только у `unanswerable` |
| `expected_section(s)` | Секции — запасной уровень разметки |
| `difficulty` | `easy` (26) / `medium` (14) / `hard` (5) |
| `unanswerable` | `true` — ответа в документе нет, проверка что ассистент не выдумывает |
| `notes` | Почему размечено именно так |

### Изменения боевого поиска в этой же ветке

Оба изменения заточены под честный eval и теперь измеримы им же.

**Rerank: `topK` 8 → 5.**

```ts
// retrieval/steps/rerank/rerank.config.ts
export const RERANK_CONFIG = {
  model: 'jina-reranker-v3.5',
  topK: 5,  // было 8, понижено для уменьшения шума в eval
} as const;
```

Меньше хитов в small-to-big → меньше лишних чанков в контексте и в `retrieved_chunk_ids` → выше precision, чуть ниже потолок recall. Классический trade-off точность/полнота — теперь измеряется прогоном с 5 и с 8 по одному датасету, а не угадывается.

**FTS: мягкая логика OR вместо жёсткого AND.**

```ts
// retrieval/steps/search/fts.ts
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

  // OR (|) вместо AND (&): документы с большим числом совпавших термов
  // получают выше rank
  return parts.join(' | ');
}
```

«как открыть кофейню и какие налоги платить» → стоп-слова `как`, `и` выброшены → `открыть:* | кофейню:* | какие:* | налоги:* | платить`.

Раньше AND требовал от чанка содержать **каждый** терм — разговорный вопрос из 6–8 слов почти никогда не матчился целиком, FTS возвращал пусто, RRF вырождался в vector-only: половина гибрида молча не работала. С OR кандидаты есть всегда, а `ts_rank` поднимает документы с большим числом совпавших термов. Шум от OR отсеивает rerank — cross-encoder стоит в конвейере ровно для этого. В `fts.ts` добавлено временное логирование `[FTS] query → tsQuery` / `[FTS] found N results` — убрать после стабилизации.

## 5. Поток данных

```
npm run eval
↓
runEval({ questionsPath, limit, outputJson })
↓
loadQuestions: questions.jsonl → EvalQuestion[45]
↓
для каждого вопроса (последовательно):
  evalRetrieve({ query, niche, expected_* })
  ↓
  классификация ниши (glm-5.3-flash) → эмбеддинг запроса (Jina)
  ↓
  vectorSearch (pgvector, 40) ∥ ftsSearch (tsquery OR, 40)
  ↓
  fuseRrf → 20 → rerank (jina-reranker-v3.5) → 5
  ↓
  expandHits (small-to-big) → группы блоков
  ↓
  extractChunkIds: только block.parts → retrieved_chunk_ids (Set, без дублей)
↓
calculateMetrics(expected, retrieved) → { precision, recall, f1, perfect_match }
↓  (ошибка вопроса → stderr, вопрос пропущен, прогон продолжается)
aggregateMetrics → общий срез + by_difficulty + by_group
↓
stdout-отчёт (+ eval-results.json при --json)
```

## 6. Почему так, а не иначе

1. **Только `block.parts`, без parent/links** — иначе каждый вопрос получал бы автоматические FP от expand-контекста, и метрики измеряли бы дизайн expand, а не качество поиска.
2. **Set-based метрики (P/R/F1), а не ранговые (MRR/nDCG)** — для старта достаточно ответа «находит ли правильные чанки»; ранговые потребуют хранить позицию каждого чанка. Формат `eval-results.json` позволяет добавить их без переделки раннера.
3. **Последовательный прогон с пропусками ошибок** — лог читается сверху вниз, нагрузка на БД/API предсказуема, один сбой API не обнуляет прогон из 45 вопросов.
4. **Датасет размечен двумя уровнями (чанки + секции)** — метрики по чанкам хрупки к передроблению чанкинга (id меняются), по секциям — нет. Секции пока только сохраняются в результате, метрики по ним — следующий шаг.

## Преимущества

- ✅ Любое изменение поиска проверяется прогоном `npm run eval`, а не на глаз
- ✅ Счётчики этапов показывают, ГДЕ теряются чанки: vector / fts / rrf / rerank
- ✅ `evalRetrieve` гоняет боевой pipeline — eval измеряет то, что реально работает в проде
- ✅ `eval-results.json` хранит по-вопросные expected/retrieved — разбор FP/FN без перезапуска
- ✅ Разбивка по difficulty/group локализует деградацию: easy ок, hard просел → проблема в формулировках, не в поиске
- ✅ Ошибка одного вопроса не роняет прогон из 45
