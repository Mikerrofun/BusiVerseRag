import { RETRIEVAL_CONFIG } from '../config/retrieval.config';
import { isNicheCode } from '../config/niches.config';
import { RetrieveInput, RetrievalResult } from '../types/retrieval.types';
import { assembleContext } from './assemble';
import { detectNiche } from './classifier';
import { embedQuery } from './embed-query';
import { expandHits } from './expand';
import { ftsSearch } from './fts';
import { rerank } from './rerank';
import { fuseRrf } from './rrf';
import { vectorSearch } from './vector-search';

// Оркестратор (план 06, раздел 5): знает порядок шагов, шаги знают только
// свои входы/выходы из типов.
export async function retrieve(input: RetrieveInput): Promise<RetrievalResult> {
  // Шаг 1. Валидация входа: понятная ошибка, не падение
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) throw new Error('query: обязательна непустая строка');
  if (input.niche !== undefined && !isNicheCode(input.niche)) {
    throw new Error(`niche: неизвестный код «${String(input.niche)}»`);
  }

  // Шаг 2. Определение ниши: ui → fulltext-probe → llm → none
  const decision = await detectNiche(query, input.niche);

  // Шаг 3. Эмбеддинг запроса
  const vector = await embedQuery(query);

  // Шаг 4. Два поиска параллельно, с одним фильтром ниши
  const [vectorHits, ftsHits] = await Promise.all([
    vectorSearch(vector, decision.niche, RETRIEVAL_CONFIG.searchTopK),
    ftsSearch(query, decision.niche, RETRIEVAL_CONFIG.searchTopK),
  ]);

  // Шаг 5. RRF → отрезка до 20 (окончательная: rerank видит только эти 20)
  const fused = fuseRrf([vectorHits, ftsHits], RETRIEVAL_CONFIG.rrfK).slice(
    0,
    RETRIEVAL_CONFIG.rrfTopK,
  );

  // Шаг 6. Rerank → топ-8; ошибка API не роняет пайплайн — RRF-порядок
  const reranked = await rerank(query, fused);
  const top = (reranked ?? fused).slice(0, RETRIEVAL_CONFIG.rerankTopK);

  // Шаги 7–8. Small-to-big + ссылки
  const groups = await expandHits(top);

  // Шаг 9. Сборка контекста
  const assembled = assembleContext(groups);

  // Шаг 10. Контракт раздела 4
  return {
    context: assembled.context,
    chunks: assembled.chunks,
    meta: {
      niche: decision.niche,
      niche_source: decision.source,
      confidence: decision.confidence,
      counters: {
        vector: vectorHits.length,
        fts: ftsHits.length,
        rrf: fused.length,
        rerank: top.length,
        context: assembled.usedCount,
      },
      truncated: assembled.truncated,
    },
  };
}
