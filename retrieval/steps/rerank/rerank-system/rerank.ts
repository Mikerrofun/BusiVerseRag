import { MODELS_CONFIG } from '../../../config/models.config';
import { ScoredChunk } from '../../../types/retrieval.types';
import { withRetry } from '../../../lib/retry';
import { RERANK_CONFIG } from './rerank.config';
import { JinaRerankResponse } from './rerank.types';


function apiKey(): string {
  const override = process.env[MODELS_CONFIG.env.jinaRerankKey];
  if (override) return override;
  const shared = process.env[MODELS_CONFIG.env.jinaEmbedKey];
  if (!shared) {
    throw new Error(
      `Ни ${MODELS_CONFIG.env.jinaRerankKey}, ни ${MODELS_CONFIG.env.jinaEmbedKey} не заданы`,
    );
  }
  return shared;
}
export async function rerank(query: string, items: ScoredChunk[]): Promise<ScoredChunk[]> {
  if (items.length === 0) return [];
  const key = apiKey();

  return withRetry('jina rerank', async () => {
    const res = await fetch(MODELS_CONFIG.jinaRerankUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: RERANK_CONFIG.model,
        query,
        documents: items.map((item) => item.chunk.text),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Jina Rerank API ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as JinaRerankResponse;
    // Jina может вернуть results не по порядку — восстанавливаем по index
    return json.results
      .map((r) => ({ chunk: items[r.index]?.chunk, score: r.relevance_score }))
      .filter((r): r is ScoredChunk => !!r.chunk)
      .sort((a, b) => b.score - a.score)
      .slice(0, RERANK_CONFIG.topK);
  });
}
