import { RETRIEVAL_CONFIG } from '../config/retrieval.config';
import { ChunkRow, ScoredChunk } from '../types/retrieval.types';
import { CHUNK_COLUMNS, getPool, nicheFilter } from './db';
import { withRetry } from '../../scripts/lib/retry';

// Полнотекстовый поиск (план 06, шаг 4): to_tsquery('russian', ...) с
// префикс-матчингом окончаний. websearch_to_tsquery префиксы не поддерживает,
// поэтому запрос разбирается на термины на стороне приложения.

// Префиксуются кириллические термины («кофейн*» найдёт «кофейни», «кофейням»).
// Числа и латиница-артикулы («152-ФЗ», «SOP-1») не префиксуются — точные термины.
function buildTsQuery(query: string): string | null {
  const terms = query.toLowerCase().match(/[a-zа-яё0-9]+/g) ?? [];
  const parts = terms.map((t) =>
    /^[а-яё]+$/.test(t) && t.length >= RETRIEVAL_CONFIG.ftsPrefixMinLength ? `${t}:*` : t,
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
