import { MODELS_CONFIG } from '../config/models.config';
import { JinaRerankResponse, ScoredChunk } from '../types/retrieval.types';
import { withRetry } from '../../scripts/lib/retry';

// Переранжирование через jina-reranker-v3.5 (план 06, шаг 6).
// Ключ: RERANKER_API_JINA (override) или общий EMBEDING_API_JINA.
function rerankApiKey(): string {
  const override = process.env[MODELS_CONFIG.env.jinaRerankKey];
  if (override) return override;
  const shared = process.env[MODELS_CONFIG.env.jinaEmbedKey];
  if (!shared) {
    throw new Error(
      `Ни ${MODELS_CONFIG.env.jinaRerankKey}, ни ${MODELS_CONFIG.env.jinaEmbedKey} не заданы — rerank не может работать`,
    );
  }
  return shared;
}

export async function rerank(query: string, items: ScoredChunk[]): Promise<ScoredChunk[] | null> {
  if (items.length === 0) return [];
  const apiKey = rerankApiKey();

  try {
    return await withRetry('jina rerank', async () => {
      const res = await fetch(MODELS_CONFIG.jinaRerankUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODELS_CONFIG.rerankModel,
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
      // и сортируем по убыванию релевантности
      return json.results
        .map((r) => ({ chunk: items[r.index]?.chunk, score: r.relevance_score }))
        .filter((r): r is { chunk: (typeof items)[number]['chunk']; score: number } => !!r.chunk)
        .sort((a, b) => b.score - a.score);
    });
  } catch (err) {
    // Ошибка API rerank не роняет пайплайн: продолжаем с RRF-порядком (план 06, шаг 6)
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[v0] rerank недоступен, продолжаем с RRF-порядком: ${msg}`);
    return null;
  }
}
