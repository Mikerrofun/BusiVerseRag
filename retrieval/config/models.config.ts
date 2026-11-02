// Точки подключения внешних API. Имена env-переменных — только здесь.

export const MODELS_CONFIG = {
  jinaEmbedUrl: 'https://api.jina.ai/v1/embeddings',
  jinaRerankUrl: 'https://api.jina.ai/v1/rerank',
  // Тот же модель, что при ингесте (scripts/embeddings) — иначе вектора запроса
  // и чанков несопоставимы и vector-поиск вернёт мусор без ошибок
  embedModel: 'jina-embeddings-v5-omni-small',
  embedDimensions: 1024,
  embedTask: 'retrieval.query' as const,
  rerankModel: 'jina-reranker-v3.5',
  zaiUrl: 'https://api.z.ai/api/paas/v4/chat/completions',
  llmModel: 'glm-5.3-flash',
  // GLM-5.3: thinking.type обязан быть 'enabled', глубина регулируется reasoning_effort
  llmReasoningEffort: 'low' as const,
  env: {
    databaseUrl: 'DATABASE_URL',
    // Эмбеддинги + rerank по умолчанию — ключ один
    jinaEmbedKey: 'EMBEDING_API_JINA',
    // Опциональный override для rerank
    jinaRerankKey: 'RERANKER_API_JINA',
    zaiKey: 'ZAI_API_KEY',
  },
} as const;
