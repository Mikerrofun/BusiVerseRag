export const RERANK_CONFIG = {
  model: 'jina-reranker-v3.5',
  // Сколько хитов после rerank уходит в small-to-big
  topK: 8,
} as const;
