---

**Дата:** 09.11.2026
**Теги:** #features #retrieval #eval #rag #metrics

---

## 1. Зачем

Первая версия eval-кита (см. `eval-kit.md`, 05.11.2026) дала базовый ответ «находит ли поиск правильные чанки», но у неё были три системные проблемы, которые вскрылись на первом полном прогоне (34/45 вопросов, `fullEvalRun-08112026.json`):

1. **Метрики измеряли дизайн expand, а не поиск.** Expected был размечен на уровне одной части блока (`coffee_shop-1.3-b01-p1`), а retrieved содержал все части групп после small-to-big. Части того же блока, что и expected, считались false positives — precision системно занижался, и по цифрам нельзя было отличить «поиск нашёл правильный блок» от «поиск промахнулся».
2. **Порядок выдачи терялся.** `extractChunkIds` возвращал Set — информация «насколько высоко в выдаче стоит правильный чанк» уничтожалась ещё до метрик. А именно позиция в rerank — главный сигнал качества: правильный ответ на 1-м месте и на 20-м — разные системы, хотя set-based precision у них одинаковый.
3. **Валидация ниши роняла валидные вопросы.** `q-hard-03` с `business_type: null` падал с ошибкой «niche: неизвестный код "null"» до запуска пайплайна — хотя null («ниша неизвестна») — легитимное значение, при котором классификатор должен сам определить нишу.

План `docs/eval/evalImprove-plan.md` закрывает все три: переразметка датасета на уровень блоков, ранговая метрика MRR по порядку rerank, фикс валидации ниши — плюс полная переработка системы метрик.

## 2. Где/что уже было

Переиспользовано без изменений:

- боевой pipeline и все его шаги — search, RRF, rerank, expand не тронуты вообще (это принципиально: eval-слой менялся, система поиска — нет);
- `evalRetrieve` и слой `evalFunction/` — расширены, но структура сохранена;
- раннер `runEval`, loaders, CLI-флаги, JSON-отчёт — сохранены;
- формат questions.jsonl — тот же набор полей (минус `unanswerable`, см. ниже).

Нового: конфиг метрик, функция порядка rerank, переписанные metrics/aggregation/formatters, юнит-тесты.

## 3. Реализация

```
retrieval/eval/
  eval.config.ts           ← НОВОЕ: PERFECT_THRESHOLD = 0.9
  questions.jsonl          ← ПЕРЕРАБОТАН: 30 вопросов, expected на уровне блоков
  evalFunction/
    eval.ts                ← + extractOrderedChunkIds, top_rerank_score
    eval.types.ts          ← niche: NicheCode | null; новые поля результата
  runner/
    runner.ts              ← вызов новых метрик, новые поля в JSON
    runner.types.ts        ← EvalMetrics (новая форма), GroupStats, AggregatedMetrics
    metrics.ts             ← ПЕРЕПИСАН: recall / hit / precision / MRR / perfect_match
    aggregation.ts         ← ПЕРЕПИСАН: средние + by_difficulty / by_group (GroupStats)
    formatters.ts          ← ПЕРЕПИСАН: печать новой сводки
```

### 3.1. Фикс валидации ниши — null легитимен

**Логика до:** `niche?: NicheCode` (undefined = «не передана») + проверка `isNicheCode` роняла вызов на `null`. Вопросы без явной ниши физически не могли пройти eval.

**Логика после:** в системе для ниши не существует undefined — есть либо валидный `NicheCode`, либо `null` («ниша неизвестна»):

```ts
// eval.types.ts
export interface EvalRetrieveInput {
  query: string;
  /** Ниша: валидный NicheCode или null («ниша неизвестна»). undefined в системе не существует */
  niche: NicheCode | null;
  ...
}

// eval.ts — валидация: null пропускается, мусор — нет
if (input.niche !== null && !isNicheCode(input.niche)) {
  throw new Error(`niche: неизвестный код «${String(input.niche)}»`);
}
```

Дальше по цепочке ничего менять не пришлось: `detectNiche(query, uiNiche)` при falsy `uiNiche` (в т.ч. null) и так шёл в автоопределение ниши (fulltext-probe → llm) — расширена только сигнатура до `NicheCode | null`. В runner убран cast `as NicheCode | undefined` — `q.business_type` теперь типизирован как `NicheCode | null` и передаётся как есть.

Эффект: `q-hard-03` («Как открыть кофейню с нуля?», business_type: null) больше не падает, а тестирует ровно то, для чего создан — автоопределение ниши классификатором.

### 3.2. Датасет: 45 → 30, expected на уровне блоков

**Структура после переработки: ровно 30 вопросов — 15 easy / 10 medium / 5 hard.**

| Что | Сколько | Логика |
|---|---|---|
| niche-вопросы | 25 (по 2–3 на каждую из 10 ниш) | у каждой ниши сохранены case (X.2) + finmodel (X.3); SOP (X.6) остался у ниш, где не удалён |
| hard-вопросы | 5 (все coffee_shop) | coffee — самая богатая данными ниша, сложные вопросы там |
| global-вопросы | 0 (было 10) | удалены полностью — вне скоупа retrieval-фильтра ниши |

Ключевые решения по составу:

- **Удалены 5 easy:** `q-niche-01`, `q-niche-03` (coffee перегружен — 8 вопросов из 45, их expected частично дублируют q-hard-01/q-hard-04), `q-niche-12`, `q-niche-15`, `q-niche-27` (SOP-вопросы ниш с богатыми данными — case+finmodel сохранены у всех ниш).
- **`q-niche-04` easy → medium:** «Сколько стоит открыть ПВЗ и когда он выйдет в плюс» — двойной вопрос с двумя expected-блоками, объективно сложнее одночастных easy.
- **Добавлен `q-hard-06`** (взамен удалённого unanswerable, см. 3.5): «Где кофейня чаще всего ошибается с деньгами и как не попасть на штрафы от проверяющих?» — мультиблочный (1.7 ловушки + 1.8 санкции), эти секции не были покрыты ни одним hard-вопросом.
- **qid сохранены** у всех оставшихся вопросов — история прогонов сравнима по qid.

**Главное изменение разметки — expected на уровне блока.** Раньше expected содержал одну часть (`coffee_shop-1.3-b01-p1`), теперь — все части блока (`-p1`, `-p2`, ...). Расширение выполнено одноразовым скриптом по локальной папке `data/chunks` (без обращения к БД): каждый part-level id раскрывается в полный список частей своего блока, существование каждой части проверяется по фактическим chunk_id чанкера. Скрипт в репозиторий не сохранён — переразметка одноразовая, её результат зафиксирован в questions.jsonl.

**Почему это меняет смысл метрик:** retrieved после expand содержит все части групп. При part-level expected части того же блока, что и expected, считались FP — система «наказывалась» за то, что expand притащил соседние части правильного блока. При block-level expected сравнение множеств честное: правильный блок целиком = TP, чужие блоки = FP. Теперь метрики измеряют качество поиска, а не дизайн expand.

### 3.3. Порядок rerank в отчётах — retrieved_chunk_ids_ordered и top_rerank_score

**Логика до:** `extractChunkIds` собирал chunk_id в Set — порядок выдачи терялся на выходе eval-функции. Ранговые метрики были невозможны в принципе.

**Логика после:** добавлена чистая функция-читатель, которая **не меняет пайплайн**, а восстанавливает уже существующий порядок:

```ts
// eval.ts
function extractOrderedChunkIds(groups): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {          // группы в порядке первых вхождений хитов
    for (const part of group.block.parts) {
      if (!seen.has(part.chunk_id)) {    // часть может быть в нескольких группах —
        seen.add(part.chunk_id);         // берём первое (лучшее) вхождение
        ordered.push(part.chunk_id);
      }
    }
  }
  return ordered;
}
```

Ключевое наблюдение, на котором построена функция: `expandHits` возвращает группы в порядке первых вхождений хитов после rerank (Map сохраняет порядок вставки — группа создаётся при первом хите блока). Поэтому итерация по группам сверху вниз и есть порядок rerank: от лучшего хита к худшему. Никакой сортировки не нужно — порядок уже есть в данных, его нужно было не терять.

В результат добавлены два поля:

```ts
// eval.types.ts
retrieved_chunk_ids_ordered: string[];  // те же chunk_id в порядке rerank, без дублей
top_rerank_score: number | null;        // скор первой группы (лучший хит); null если пусто
```

`top_rerank_score` — это `groups[0].score`: максимальный rerank-скор среди хитов лучшей группы. Практическая ценность — калибровка будущего maxRerank-гейта (фича «если скор лучшего хита низкий — в контекст ничего не летит»): в JSON-отчёте по каждому вопросу теперь виден скор лучшего хита, и порог гейта подбирается по распределению скоров на реальном датасете, а не на глаз.

Оба поля пишутся в `eval-results.json` рядом с `retrieved_chunk_ids` — разбор «правильный ответ был на 12-м месте» делается постфактум без перезапуска.

### 3.4. Новая система метрик

**Логика до:** precision / recall / F1 по part-level expected + строгий `perfect_match` (всё найдено И лишнего нет — на практике почти недостижим из-за FP от expand). Порядок не учитывался.

**Логика после** (`metrics.ts`, чистое сравнение множеств + позиция):

```ts
const expectedSet = new Set(expected);
const retrievedSet = new Set(retrieved);
const matched = Array.from(expectedSet).filter((id) => retrievedSet.has(id)).length;

const recall    = expectedSet.size > 0 ? matched / expectedSet.size : 0;
const precision = retrievedSet.size > 0 ? matched / retrievedSet.size : 0;
const hit       = recall > 0;
const firstMatchIndex = retrievedOrdered.findIndex((id) => expectedSet.has(id));
const mrr       = firstMatchIndex >= 0 ? 1 / (firstMatchIndex + 1) : 0;
const perfect_match = recall >= EVAL_CONFIG.PERFECT_THRESHOLD;  // 0.9
```

| Метрика | Формула | Что отвечает | Диагностика |
|---|---|---|---|
| `recall` | \|expected ∩ retrieved\| / \|expected\| | доля нужного, которое нашлось | низкий → поиск теряет нужный контент (главная метрика) |
| `precision` | \|expected ∩ retrieved\| / \|retrieved\| | доля правильного среди найденного | низкий → шум в выдаче съедает токены контекста |
| `hit` | recall > 0 | нашлась ли хоть одна expected-часть | грубый «попал/не попал» для hit_rate |
| `mrr` | 1/позиция первого expected в ordered | насколько высоко правильное в выдаче | низкий при высоком recall → правильное есть, но глубоко |
| `perfect_match` | recall ≥ 0.9 | вопрос решён полностью | счётчик «идеальных» вопросов |

Отличия от старой системы:

- **F1 убран** — при block-level expected он дублирует recall/precision и маскирует их раздельную динамику (recall мог расти за счёт шума — F1 этого не показывал бы).
- **perfect_match переопределён** со строгого «всё найдено и лишнего нет» на порог recall ≥ 0.9. Старое определение при block-level expected почти недостижимо (expand почти всегда тащит соседние блоки → FP → строгий флаг всегда false и ничего не измеряет). Порог вынесен в `retrieval/eval/eval.config.ts` — калибруется без правки кода.
- **MRR добавлен** — первая ранговая метрика; стала возможна благодаря `retrieved_chunk_ids_ordered` (3.3).
- **Дубликаты не искажают:** сравнение идёт по множествам — повтор чанка в нескольких группах не завышает precision.

### 3.5. Unanswerable-вопросы удалены из ите��ации

Решение по итогам обсуждения: eval-набор проверяет **только вопросы, ответ на которые есть в БД**. Логика: unanswerable проверяет не retrieval, а поведение отказа («система честно сказала, что данных нет»); отказ будет реа��изовываться отдельной фичей — maxRerank-гейтом, и проверка отказа относится к той фиче, а не к этому eval.

Вырезано полностью: поле `unanswerable` из `EvalQuestion` и `EvalMetrics`, параметр из `calculateMetrics`, фильтрация и `UnanswerableStats` из `aggregateMetrics`, строка из formatters. Метрики считаются для всех вопросов без пропусков.

Сохранено заделом на будущее: `top_rerank_score` в отчёте (нужен для калибровки порога гейта) и нейтральная обработка пустого expected в метриках (нули, не деление на ноль).

### 3.6. Агрегация: GroupStats и два разреза

`aggregateMetrics` берёт per-question метрики (expected на этом уровне уже не участвует) и сводит их в отчёт:

```ts
// runner.types.ts
export interface GroupStats {
  count: number;           // вопросов в срезе
  avg_recall: number;
  avg_precision: number;
  avg_mrr: number;
  hit_rate: number;        // доля вопросов среза с hit
  perfect_matches: number; // сколько вопросов среза решено полностью
}

export interface AggregatedMetrics {
  total_questions: number;
  hit_rate: number;
  perfect_matches: number;
  avg_recall: number;
  avg_precision: number;
  avg_mrr: number;
  by_difficulty: Record<string, GroupStats>;  // easy / medium / hard
  by_group: Record<string, GroupStats>;       // niche / hard
}
```

Каждый срез датасета получает свой `GroupStats`. Зачем разрезы: `easy` recall = 0.9 при `hard` = 0.4 → проблема в сложных формулировках, а не в базовом поиске; просадка `niche` при нормальном `hard` → классификация ниши или нишевый корпус. Старый разрез `global` исчез вместе с global-вопросами.

## 4. Поток данных

```
npm run eval
↓
runEval → loadQuestions: questions.jsonl → EvalQuestion[30]
↓
для каждого вопроса (последовательно):
  evalRetrieve({ query, niche: NicheCode | null, expected_* })
  ↓
  валидация ниши (null легитимен) → классификация (если null) → эмбеддинг
  ↓
  vectorSearch (40) ∥ ftsSearch (40) → fuseRrf (20) → rerank (5)
  ↓
  expandHits → группы блоков (порядок групп = порядок rerank)
  ↓
  extractChunkIds          → retrieved_chunk_ids (Set)
  extractOrderedChunkIds   → retrieved_chunk_ids_ordered (порядок rerank)
  groups[0].score          → top_rerank_score
↓
calculateMetrics(expected, retrieved, retrievedOrdered)
  → { recall, hit, precision, mrr, perfect_match }   ← единственное сравнение с expected
↓  (ошибка вопроса → stderr, вопрос пропущен, прогон продолжается)
aggregateMetrics → общие средние + by_difficulty + by_group (GroupStats)
↓
printAggregatedMetrics (stdout) + eval-results.json при --json
  (по-вопросно: metrics + retrieved_chunk_ids + retrieved_chunk_ids_ordered + top_rerank_score)
```

## 5. Почему так, а не иначе

1. **Expected на уровне блоков, а не частей** — иначе метрики наказывали expand за соседние части правильного блока и измеряли дизайн expand, а не поиск. Блок — единица смысла: если найден хоть один part блока, блок «найден».
2. **Порядок берётся из Map, а не пересчитывается** — expandHits уже возвращает группы в порядке rerank; пересортировка потребовала бы тащить скор каждого чанка через expand и дублировала бы логику. Функция-читатель дешевле и не может разойтись с пайплайном.
3. **MRR вместо nDCG** — для старта достаточно «насколько высоко первое правильное»; nDCG требует релевантности каждого чанка в выдаче, которой разметка не даёт. Формат отчёта (ordered-список в JSON) позволяет добавить nDCG без переделки раннера.
4. **perfect_match по порогу recall, а не строгий** — строгий «всё и ничего лишнего» при block-level expected недостижим (expand тащит контекст) и выродился бы в константный false. Порог 0.9 отделяет «решено» от «найдено частично» и калибруется в конфиге.
5. **Unanswerable убран, а не переделан** — проверка отказа относится к будущей maxRerank-фиче; держать в retrieval-eval вопрос, который заведомо портит средние, — измерение не того слоя. Возвращение таких вопросов (для калибровки порога гейта) не потребует переделки: код метрик нейтрален к пустому expected.
6. **30 вопросов, а не 45** — 10 global были вне скоупа нишевого фильтра и размывали интерпретацию разрезов; 5 дублирующих easy не добавляли информации. Меньше датасет → быстрее прогон → чаще запускается.

## Преимущества

- ✅ Метрики измеряют качество поиска, а не дизайн expand — expected на уровне блоков убрал системные FP
- ✅ MRR + `retrieved_chunk_ids_ordered` — видно не только «что нашлось», но и «насколько высоко в rerank»
- ✅ `top_rerank_score` по каждому вопросу — готовые данные для калибровки порога будущего maxRerank-гейта
- ✅ null-ниша легитимна — вопросы без явной ниши тестируют автоопределение классификатором, а не падают
- ✅ Датасет 30 вопросов: 15/10/5, только ответимое, по 2–3 на нишу — быстрый прогон, чистые разрезы
- ✅ Порог perfect_match в конфиге — калибруется без правки кода
- ✅ Боевой pipeline не тронут — все изменения только в eval-слое
