import { FILTER_RERANK_CONFIG } from './filter-rerank.config';
import type { FilterRerankInput, FilterRerankOutput } from './filter-rerank.types';

export function filterRerank(items: FilterRerankInput): FilterRerankOutput {
  if (items.length === 0) return [];

  const maxScore = Math.max(...items.map((item) => item.score));
  if (maxScore < FILTER_RERANK_CONFIG.maxThreshold) {
    // Лучший результат слабый — весь топ нерелевантен.
    return [];
  }

  // Max прошёл, но чистим слабые из хвоста.
  return items.filter((item) => item.score >= FILTER_RERANK_CONFIG.individualThreshold);
}

export type { FilterRerankInput, FilterRerankOutput } from './filter-rerank.types';
