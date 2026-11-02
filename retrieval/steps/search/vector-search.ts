import { ChunkRow, ScoredChunk } from '../../types/retrieval.types';
import { CHUNK_COLUMNS, getPool, nicheFilter } from '../../lib/db';
import { withRetry } from '../../lib/retry';

// Векторный поиск: косинусное расстояние по HNSW-индексу.
// Вектор запроса нормализован, сходство = 1 - расстояние.
export async function vectorSearch(
  vector: number[],
  niche: string | null,
  limit: number,
): Promise<ScoredChunk[]> {
  const pool = getPool();
  const vecLiteral = `[${vector.join(',')}]`;

  const params: unknown[] = [vecLiteral];
  const filter = niche ? (params.push(niche), nicheFilter(niche, 2)) : '';
  params.push(limit);
  const limitIdx = params.length;

  const sql = `select ${CHUNK_COLUMNS}, 1 - (embedding <=> $1::vector) as score
    from chunks
    where embedding is not null ${filter}
    order by embedding <=> $1::vector
    limit $${limitIdx}`;

  const { rows } = await withRetry('vector search', () => pool.query(sql, params));
  return rows.map((row: ChunkRow & { score: string | number }) => ({
    chunk: row,
    score: Number(row.score),
  }));
}
