---

**Дата:** 10.11.2026  
**Теги:** #features #retrieval #rerank #rag

---

## 1. Зачем

Reranker ранжирует кандидатов, но даже лучший из них может быть слабым. Если передать такой результат в контекст, он добавит модели нерелевантный шум. Фильтр после rerank либо отбрасывает весь слабый топ, либо удаляет слабые результаты из его хвоста.

## 2. Реализация

Фильтр находится в `retrieval/steps/rerank/filter-rerank/` и работает после обычного rerank, до `expandHits`:

```ts
const top = await rerank(query, fused); // максимум topK результатов
const filtered = filterRerank(top);
const groups = await expandHits(filtered);
```

Два порога задаются в `filter-rerank.config.ts`:

```ts
maxThreshold: 0.3,
individualThreshold: 0.25,
```

Если максимальный score ниже `0.30`, весь набор отбрасывается: даже лучший кандидат недостаточно релевантен. Иначе остаются только результаты со score не ниже `0.25` — это убирает слабый хвост, сохраняя хорошие результаты. Пустой вход возвращает пустой массив.

```ts
if (maxScore < maxThreshold) return [];
return items.filter((item) => item.score >= individualThreshold);
```

Фильтр подключён и в production retrieval, и в eval. В eval `rerank` считает результаты до фильтра, `filtered` — после.

## 3. Зачем eval сохраняет score до фильтра

`top_rerank_score` берётся из `top[0].score` до фильтрации. Это не меняет top-K и не участвует в решении retrieval — это диагностическое поле eval. Например, score `0.24` должен остаться в отчёте даже если фильтр вернул `[]`: по нему видно, что кандидат был, но max-гейт его отверг. Если брать score после фильтра/expand, в этом случае в отчёте будет только `null`, и нельзя будет проверить, не слишком ли строгий порог.

```ts
const topRerankScore = top[0]?.score ?? null;
const filtered = filterRerank(top);
```

Это помогает проверять ложные отказы и калибровать пороги по eval-результатам. Текущая калибровка описана в `docs/eval/fullEvalRun-11102026-eval-improve.md`.
