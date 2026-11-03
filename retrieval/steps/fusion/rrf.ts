import { ScoredChunk } from '../../types/retrieval.types';
import { FUSION_CONFIG } from './fusion.config';

export function fuseRrf(lists: ScoredChunk[][]): ScoredChunk[] {
  const fused = new Map<string, ScoredChunk>();

  for (const list of lists) {
    list.forEach((item, i) => {
      const contribution = 1 / (FUSION_CONFIG.k + i + 1);
      const existing = fused.get(item.chunk.chunk_id);
      if (existing) {
        existing.score += contribution;
      } else {
        fused.set(item.chunk.chunk_id, { chunk: item.chunk, score: contribution });
      }
    });
  }

  return Array.from(fused.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, FUSION_CONFIG.topK);
}
