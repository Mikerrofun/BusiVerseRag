export const EMBEDDING_CONFIG = {
  // Тот же модель, что при ингесте — иначе вектора запроса и чанков несопоставимы
  model: 'jina-embeddings-v5-omni-small',
  dimensions: 1024,
  task: 'retrieval.query' as const,
} as const;
