import { encodingForModel } from 'js-tiktoken';
import { ChunkRole, ContextChunk } from '../../types/retrieval.types';
import { ExpandedGroup } from '../expand/expand.types';
import { ASSEMBLE_CONFIG } from './assemble.config';
import { AssembledContext } from './assemble.types';

const MARKERS: Record<'block' | 'parent' | 'link', string> = {
  block: 'Источник',
  parent: 'Контекст секции',
  link: 'Связанный раздел',
};

function renderUnit(unitKind: 'block' | 'parent' | 'link', heading: string, text: string): string {
  return `## ${MARKERS[unitKind]}: ${heading}\n\n${text}`;
}

export function assembleContext(groups: ExpandedGroup[]): AssembledContext {
  const encoder = encodingForModel(ASSEMBLE_CONFIG.encoderModel);
  const countTokens = (text: string): number => encoder.encode(text).length;

  const ordered = [...groups].sort((a, b) => b.score - a.score);

  const sections: string[] = [];
  const chunks: ContextChunk[] = [];

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
    // группа пропускается, атомарность блока важнее точного попадания в бюджет
    if (used + blockTokens > ASSEMBLE_CONFIG.tokenBudget) {
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
      if (used + tokens > ASSEMBLE_CONFIG.tokenBudget) {
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
