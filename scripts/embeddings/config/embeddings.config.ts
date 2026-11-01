// Константы этапа эмбеддингов. Модель одна на весь проект — смена только здесь.
// Размерность зафиксирована схемой БД: chunks.embedding vector(1024).

export const EMBED_CONFIG = {
  jinaUrl: 'https://api.jina.ai/v1/embeddings',
  model: 'jina-embeddings-v5-omni-small',
  dimensions: 1024,
  batchSize: 32, // чанков на один запрос к Jina
  batchPauseMs: 500, // пауза между батчами (rate limit Jina)
} as const;
