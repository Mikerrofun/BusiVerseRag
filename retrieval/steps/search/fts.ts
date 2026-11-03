import { ChunkRow, ScoredChunk } from '../../types/retrieval.types';
import { CHUNK_COLUMNS, getPool, nicheFilter } from '../../lib/db';
import { withRetry } from '../../lib/retry';
import { SEARCH_CONFIG } from './search.config';


function buildTsQuery(query: string): string | null {
  const terms = query.toLowerCase().match(/[a-zа-яё0-9]+/g) ?? [];
  const parts = terms.map((t) =>
    /^[а-яё]+$/.test(t) && t.length >= SEARCH_CONFIG.ftsPrefixMinLength ? `${t}:*` : t,
  );
  return parts.length > 0 ? parts.join(' & ') : null;
}

export async function ftsSearch(
  query: string,
  niche: string | null,
  limit: number,
): Promise<ScoredChunk[]> {
  const tsQuery = buildTsQuery(query);
  if (!tsQuery) return [];

  const pool = getPool();
  const params: unknown[] = [tsQuery];
  const filter = niche ? (params.push(niche), nicheFilter(niche, 2)) : '';
  params.push(limit);
  const limitIdx = params.length;

  const sql = `select ${CHUNK_COLUMNS}, ts_rank(tsv, q) as score
    from chunks, to_tsquery('russian', $1) q
    where tsv @@ q ${filter}
    order by score desc
    limit $${limitIdx}`;

  const { rows } = await withRetry('fts search', () => pool.query(sql, params));
  return rows.map((row: ChunkRow & { score: string | number }) => ({
    chunk: row,
    score: Number(row.score),
  }));
}
