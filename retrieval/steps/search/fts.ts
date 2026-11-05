import { ChunkRow, ScoredChunk } from '../../types/retrieval.types';
import { CHUNK_COLUMNS, getPool, nicheFilter } from '../../lib/db';
import { withRetry } from '../../lib/retry';
import { SEARCH_CONFIG } from './search.config';


function buildTsQuery(query: string): string | null {
  const terms = query.toLowerCase().match(/[a-zа-яё0-9]+/g) ?? [];
  
  // Фильтруем стоп-слова (короткие предлоги и союзы)
  const stopWords = new Set(['в', 'и', 'на', 'с', 'по', 'для', 'от', 'к', 'из', 'у', 'о', 'при', 'за', 'до', 'как', 'что', 'это', 'он', 'она', 'они', 'его', 'её', 'их']);
  const filtered = terms.filter(t => t.length >= 2 && !stopWords.has(t));
  
  if (filtered.length === 0) return null;
  
  // Применяем префикс для кириллических слов >= минимальной длины
  const parts = filtered.map((t) =>
    /^[а-яё]+$/.test(t) && t.length >= SEARCH_CONFIG.ftsPrefixMinLength ? `${t}:*` : t,
  );
  
  // Используем OR (|) вместо AND (&) для более мягкого поиска
  // Документы, содержащие больше терминов, получат выше rank
  return parts.join(' | ');
}

export async function ftsSearch(
  query: string,
  niche: string | null,
  limit: number,
): Promise<ScoredChunk[]> {
  const tsQuery = buildTsQuery(query);
  
  // Временное логирование для отладки
  console.log(`[FTS] query: "${query}" → tsQuery: "${tsQuery}"`);
  
  if (!tsQuery) {
    console.log('[FTS] tsQuery is null, returning empty');
    return [];
  }

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
  
  console.log(`[FTS] found ${rows.length} results`);
  
  return rows.map((row: ChunkRow & { score: string | number }) => ({
    chunk: row,
    score: Number(row.score),
  }));
}
