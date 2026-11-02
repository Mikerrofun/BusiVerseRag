import { MODELS_CONFIG } from '../../config/models.config';
import { withRetry } from '../../lib/retry';
import { EMBEDDING_CONFIG } from './embedding.config';
import { JinaEmbeddingResponse } from './embedding.types';

// Эмбеддинг запроса через Jina. Тот же вызов, что в scripts/embeddings,
// но task: retrieval.query и один вход, не батч.
export async function embedQuery(query: string): Promise<number[]> {
  const apiKey = process.env[MODELS_CONFIG.env.jinaEmbedKey];
  if (!apiKey) {
    throw new Error(`${MODELS_CONFIG.env.jinaEmbedKey} is not set (.env.local)`);
  }

  return withRetry('jina embed query', async () => {
    const res = await fetch(MODELS_CONFIG.jinaEmbedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: EMBEDDING_CONFIG.model,
        task: EMBEDDING_CONFIG.task,
        dimensions: EMBEDDING_CONFIG.dimensions,
        normalized: true,
        input: [query],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Jina API ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as JinaEmbeddingResponse;
    const data = json.data.find((d) => d.index === 0) ?? json.data[0];
    if (!data?.embedding) throw new Error('Jina API не вернул эмбеддинг запроса');
    return data.embedding;
  });
}
