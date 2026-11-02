import { ChunkRow, ScoredChunk } from '../types/retrieval.types';

// RRF (план 06, шаг 5). Работает только с позициями: сырые скоры vector и FTS
// несравнимы и не используются. Дубль из обоих списков остаётся один раз, но
// с суммой вкладов — совпадение в двух независимых поисках бустится наверх.
// score = Σ 1/(k + rank), rank начинается с 1.
export function fuseRrf(lists: ScoredChunk[][], k: number): ScoredChunk[] {
  const fused = new Map<string, { chunk: ChunkRow; score: number }>();

  for (const list of lists) {
    list.forEach((item, i) => {
      const contribution = 1 / (k + i + 1);
      const existing = fused.get(item.chunk.chunk_id);
      if (existing) {
        existing.score += contribution;
      } else {
        fused.set(item.chunk.chunk_id, { chunk: item.chunk, score: contribution });
      }
    });
  }

  return Array.from(fused.values()).sort((a, b) => b.score - a.score);
}
