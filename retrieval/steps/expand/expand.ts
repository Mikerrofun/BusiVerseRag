import { ChunkRow, ScoredChunk } from '../../types/retrieval.types';
import { CHUNK_COLUMNS, getPool } from '../../lib/db';
import { withRetry } from '../../lib/retry';
import { ExpandedGroup } from './expand.types';
import { EXPAND_CONFIG } from './expand.config';


async function fetchBlocksOfSections(parentIds: string[]): Promise<ChunkRow[]> {
  if (parentIds.length === 0) return [];
  const pool = getPool();
  const { rows } = await withRetry('fetch blocks of sections', () =>
    pool.query<ChunkRow>(`select ${CHUNK_COLUMNS} from chunks where parent_id = any($1::text[])`, [
      parentIds,
    ]),
  );
  return rows;
}

async function fetchChunksByIds(ids: string[]): Promise<ChunkRow[]> {
  if (ids.length === 0) return [];
  const pool = getPool();
  const { rows } = await withRetry('fetch chunks by ids', () =>
    pool.query<ChunkRow>(`select ${CHUNK_COLUMNS} from chunks where chunk_id = any($1::text[])`, [
      ids,
    ]),
  );
  return rows;
}

interface LinkRow {
  from_chunk_id: string;
  to_section: string;
}

async function fetchLinks(chunkIds: string[]): Promise<LinkRow[]> {
  if (chunkIds.length === 0) return [];
  const pool = getPool();
  const { rows } = await withRetry('fetch chunk links', () =>
    pool.query<LinkRow>(
      `select from_chunk_id, to_section from chunk_links where from_chunk_id = any($1::text[])`,
      [chunkIds],
    ),
  );
  return rows;
}

async function fetchSectionChunks(codes: string[]): Promise<ChunkRow[]> {
  if (codes.length === 0) return [];
  const pool = getPool();
  const { rows } = await withRetry('fetch section chunks', () =>
    pool.query<ChunkRow>(
      `select ${CHUNK_COLUMNS} from chunks
       where section_code = any($1::text[]) and parent_id is null`,
      [codes],
    ),
  );
  return rows;
}

function headingOf(chunk: ChunkRow): string {
  return chunk.heading_path.join(' > ');
}

export async function expandHits(hits: ScoredChunk[]): Promise<ExpandedGroup[]> {
  if (hits.length === 0) return [];

  const uniqueHits: ScoredChunk[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (!seen.has(hit.chunk.chunk_id)) {
      seen.add(hit.chunk.chunk_id);
      uniqueHits.push(hit);
    }
  }

  // Определяем какие хиты получат links: топ-N или высокий score
  const hitsEligibleForLinks = uniqueHits.filter((hit, index) => {
    // Топ-N всегда получают links
    if (index < EXPAND_CONFIG.linksTopN) return true;
    // Остальные — только если score выше порога
    return hit.score >= EXPAND_CONFIG.linksScoreThreshold;
  });

  console.log(
    `[expand] Links будут загружены для ${hitsEligibleForLinks.length}/${uniqueHits.length} хитов ` +
    `(топ-${EXPAND_CONFIG.linksTopN} + score≥${EXPAND_CONFIG.linksScoreThreshold})`
  );

  const parentIds = Array.from(
    new Set(uniqueHits.map((h) => h.chunk.parent_id).filter((id): id is string => id !== null)),
  );
  const [blockRows, parentRows] = await Promise.all([
    fetchBlocksOfSections(parentIds),
    fetchChunksByIds(parentIds),
  ]);

  const parentsById = new Map(parentRows.map((c) => [c.chunk_id, c]));
  const blocksByParent = new Map<string, ChunkRow[]>();
  for (const row of blockRows) {
    const list = blocksByParent.get(row.parent_id ?? '') ?? [];
    list.push(row);
    blocksByParent.set(row.parent_id ?? '', list);
  }

  // Fetch links только для qualified хитов
  const links = await fetchLinks(hitsEligibleForLinks.map((h) => h.chunk.chunk_id));
  const sectionRows = await fetchSectionChunks(Array.from(new Set(links.map((l) => l.to_section))));
  const sectionsByCode = new Map<string, ChunkRow[]>();
  for (const row of sectionRows) {
    const list = sectionsByCode.get(row.section_code ?? '') ?? [];
    list.push(row);
    sectionsByCode.set(row.section_code ?? '', list);
  }

  // Set для быстрой проверки eligibility
  const eligibleChunkIds = new Set(hitsEligibleForLinks.map(h => h.chunk.chunk_id));

  const resolveSection = (code: string, hitType: string): ChunkRow | null => {
    const candidates = sectionsByCode.get(code) ?? [];
    return (
      candidates.find((c) => c.business_type === hitType) ??
      candidates.find((c) => c.scope === 'global') ??
      candidates[0] ??
      null
    );
  };

  const groups = new Map<string, ExpandedGroup>();
  for (const hit of uniqueHits) {
    const chunk = hit.chunk;
    const key = `${chunk.parent_id ?? ''}|${chunk.chunk_index}`;

    let group = groups.get(key);
    if (!group) {
      // Куски блока: 1 строка = блок целиком, >1 = куски, склеиваемые по порядку
      const siblings = (blocksByParent.get(chunk.parent_id ?? '') ?? []).filter(
        (c) => c.chunk_index === chunk.chunk_index,
      );
      siblings.sort((a, b) => (a.line_start ?? 0) - (b.line_start ?? 0));
      const blockUnit = {
        kind: 'block' as const,
        text: siblings.map((c) => c.text).join('\n\n'),
        heading: headingOf(chunk),
        score: hit.score,
        parts: siblings.length > 0 ? siblings : [chunk],
      };
      const parent = chunk.parent_id ? (parentsById.get(chunk.parent_id) ?? null) : null;
      const parentUnit = parent
        ? {
            kind: 'parent' as const,
            text: parent.text,
            heading: headingOf(parent),
            score: hit.score,
            parts: [parent],
          }
        : null;
      group = { key, score: hit.score, block: blockUnit, parent: parentUnit, links: [], hits: [] };
      groups.set(key, group);
    }

    if (hit.score > group.score) {
      group.score = hit.score;
      group.block.score = hit.score;
      if (group.parent) group.parent.score = hit.score;
    }
    group.hits.push(hit);

    // Links добавляем только для eligible хитов (топ-N или высокий score)
    const hitEligibleForLinks = eligibleChunkIds.has(chunk.chunk_id);
    if (hitEligibleForLinks) {
      for (const link of links.filter((l) => l.from_chunk_id === chunk.chunk_id)) {
        const section = resolveSection(link.to_section, chunk.business_type);
        if (!section) continue;
        if (group.links.some((u) => u.parts[0]?.chunk_id === section.chunk_id)) continue;
        if (group.parent && section.chunk_id === group.parent.parts[0]?.chunk_id) continue;
        group.links.push({
          kind: 'link',
          text: section.text,
          heading: headingOf(section),
          score: hit.score,
          parts: [section],
        });
      }
    }
  }

  return Array.from(groups.values());
}
