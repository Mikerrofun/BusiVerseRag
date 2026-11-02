import { encodingForModel } from 'js-tiktoken';
import { RETRIEVAL_CONFIG } from '../config/retrieval.config';
import { ChunkRole, ContextChunk, ExpandedGroup } from '../types/retrieval.types';

// Сборка финального контекста (план 06, шаг 9).

export interface AssembledContext {
  context: string;
  chunks: ContextChunk[];
  truncated: boolean;
  usedCount: number;
}

const MARKERS: Record<'block' | 'parent' | 'link', string> = {
  block: 'Источник',
  parent: 'Контекст секции',
  link: 'Связанный раздел',
};

function renderUnit(unitKind: 'block' | 'parent' | 'link', heading: string, text: string): string {
  return `## ${MARKERS[unitKind]}: ${heading}\n\n${text}`;
}

export function assembleContext(
  groups: ExpandedGroup[],
  budget: number = RETRIEVAL_CONFIG.tokenBudget,
): AssembledContext {
  const encoder = encodingForModel(RETRIEVAL_CONFIG.tokenEncoderModel);
  const countTokens = (text: string): number => encoder.encode(text).length;

  // Порядок блоков — по убыванию rerank-скора лучшего хита блока
  const ordered = [...groups].sort((a, b) => b.score - a.score);

  const sections: string[] = [];
  const chunks: ContextChunk[] = [];
  const usedIds = new Set<string>();

  // Роль приоритетнее, если чанк входит контекстом несколькими путями
  const rolePriority: Record<ChunkRole, number> = { hit: 0, part: 1, parent: 2, link: 3 };
  const pushChunk = (
    chunkId: string,
    role: ChunkRole,
    score: number,
    meta: Pick<ContextChunk, 'heading_path' | 'section_title' | 'block_title' | 'chunk_type'>,
  ) => {
    const existing = chunks.find((c) => c.chunk_id === chunkId);
    if (existing) {
      if (rolePriority[role] < rolePriority[existing.role]) existing.role = role;
      return;
    }
    chunks.push({
      chunk_id: chunkId,
      heading_path: meta.heading_path,
      section_title: meta.section_title,
      block_title: meta.block_title,
      chunk_type: meta.chunk_type,
      score,
      role,
    });
  };

  let used = 0;
  let truncated = false;

  for (const group of ordered) {
    const blockText = renderUnit('block', group.block.heading, group.block.text);
    const blockTokens = countTokens(blockText);

    // Хиты одного блока не разрезаются посреди: блок целиком не влезает —
    // группа пропускается, бюджет важнее точного попадания не ценой атомарности
    if (used + blockTokens > budget) {
      truncated = true;
      continue;
    }
    used += blockTokens;
    sections.push(blockText);

    for (const hit of group.hits) {
      pushChunk(hit.chunk.chunk_id, 'hit', hit.score, hit.chunk);
    }
    for (const part of group.block.parts) {
      pushChunk(part.chunk_id, 'part', group.score, part);
    }

    const extras: Array<{ kind: 'parent' | 'link'; unit: NonNullable<ExpandedGroup['parent']> }> = [
      ...(group.parent ? [{ kind: 'parent' as const, unit: group.parent }] : []),
      ...group.links.map((unit) => ({ kind: 'link' as const, unit })),
    ];
    for (const { kind, unit } of extras) {
      const text = renderUnit(kind, unit.heading, unit.text);
      const tokens = countTokens(text);
      if (used + tokens > budget) {
        truncated = true;
        continue;
      }
      used += tokens;
      sections.push(text);
      for (const part of unit.parts) {
        pushChunk(part.chunk_id, kind, unit.score, part);
      }
    }
  }

  return {
    context: sections.join('\n\n'),
    chunks,
    truncated,
    usedCount: chunks.length,
  };
}
