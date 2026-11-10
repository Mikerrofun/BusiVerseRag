// Публичный API retrieval-системы: наружу торчит только эта точка.
// Оркестратор знает порядок шагов, шаги знают только свои входы/выходы.
import { isNicheCode } from './config/niches.config';
import { RetrieveInput, RetrievalResult } from './types/retrieval.types';
import { detectNiche } from './steps/classification/classify';
import { embedQuery } from './steps/embedding/embed-query';
import { SEARCH_CONFIG } from './steps/search/search.config';
import { vectorSearch } from './steps/search/vector-search';
import { ftsSearch } from './steps/search/fts';
import { fuseRrf } from './steps/fusion/rrf';
import { rerank } from './steps/rerank/rerank-system/rerank';
import { filterRerank } from './steps/rerank/filter-rerank/filter-rerank';
import { expandHits } from './steps/expand/expand';
import { assembleContext } from './steps/assemble/assemble';

export async function retrieve(input: RetrieveInput): Promise<RetrievalResult> {
  // Шаг 1. Валидация входа
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
    vectorSearch(vector, decision.niche, SEARCH_CONFIG.topK),
    ftsSearch(query, decision.niche, SEARCH_CONFIG.topK),
  ]);

  // Шаг 5. RRF → отрезка до 20 
  const fused = fuseRrf([vectorHits, ftsHits]);

  // Шаг 6. Rerank → фильтрация по релевантности → топ-N
  const top = await rerank(query, fused);
  const filtered = filterRerank(top);

  // Шаги 7–8. Small-to-big + ссылки
  const groups = await expandHits(filtered);

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

export type {
  ContextChunk,
  NicheCode,
  RetrieveInput,
  RetrievalMeta,
  RetrievalResult,
} from './types/retrieval.types';
