import { MODELS_CONFIG } from '../config/models.config';
import { JinaEmbeddingResponse } from '../types/retrieval.types';
import { withRetry } from '../../scripts/lib/retry';

// Эмбеддинг запроса через Jina (план 06, шаг 3). Тот же вызов, что в
// scripts/embeddings/embed.ts, но task: retrieval.query и один вход, не батч.
export async function embedQuery(query: string): Promise<number[]> {
  const apiKey = process.env[MODELS_CONFIG.env.jinaEmbedKey];
  if (!apiKey) {
    throw new Error(
      `${MODELS_CONFIG.env.jinaEmbedKey} is not set (.env.local) — нужен для эмбеддинга запроса`,
    );
  }

  return withRetry('jina embed query', async () => {
    const res = await fetch(MODELS_CONFIG.jinaEmbedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODELS_CONFIG.embedModel,
        task: MODELS_CONFIG.embedTask,
        dimensions: MODELS_CONFIG.embedDimensions,
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
