export const RERANK_CONFIG = {
  model: 'jina-reranker-v3.5',
  // Сколько хитов после rerank уходит в small-to-big
  topK: 5,  // было 8, понижено для уменьшения шума в eval
} as const;
