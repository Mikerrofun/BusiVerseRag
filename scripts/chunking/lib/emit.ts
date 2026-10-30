// Метаданные, chunk_id и запись дерева папок (план 3, разделы 8, 9).

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG, nicheByNum } from '../config/chunking.config';
import { countTokens } from './tokens';
import { splitBlock } from './split';
import {
  BlockKind,
  ChunkFile,
  ChunkLink,
  ChunkType,
  InternalChunk,
  ParsedBlock,
  ParsedDoc,
  ParsedGroup,
  ParsedSection,
  Scope,
} from '../types/chunking.types';

export class EmitError extends Error {}

// Схема chunk_id (план 3, раздел 9.2): родитель {business_type}-{section_code},
// блок {parent_id}-b{NN}, кусок дроблёного блока {base}-p{N}
export function parentChunkId(businessType: string, sectionCode: string): string {
  return `${businessType}-${sectionCode}`;
}

export function blockChunkId(parentId: string, blockIndex: number): string {
  return `${parentId}-b${String(blockIndex).padStart(2, '0')}`;
}

export function partChunkId(baseId: string, partIndex: number, partTotal: number): string {
  return partTotal > 1 ? `${baseId}-p${partIndex}` : baseId;
}

export function buildChunks(doc: ParsedDoc): InternalChunk[] {
  const chunks: InternalChunk[] = [];

  chunks.push(preambleChunk(doc));

  for (const group of doc.groups) {
    if (group.kind === 'b0') chunks.push(b0GroupParent(group));
    group.sections.forEach((section, si) => {
      const inheritsGroupLine = group.kind === 'niche' && si === 0;
      chunks.push(sectionParent(group, section, inheritsGroupLine));
      section.blocks.forEach((block, bi) => {
        emitBlockChunks(group, section, block, bi + 1, chunks);
      });
    });
  }

  // line_end = строка перед началом следующего чанка — покрытие файла без дыр и перекрытий
  const sorted = [...chunks].sort((a, b) => a.line_start - b.line_start || a.chunk_id.localeCompare(b.chunk_id));
  sorted.forEach((c, i) => {
    c.line_end = i + 1 < sorted.length ? sorted[i + 1].line_start - 1 : doc.totalLines;
  });
  return sorted;
}

function preambleChunk(doc: ParsedDoc): InternalChunk {
  const lines = doc.preamble.lines;
  let a = 0;
  let b = lines.length - 1;
  while (a <= b && lines[a].trim() === '') a++;
  while (b >= a && lines[b].trim() === '') b--;
  const body = lines.slice(a, b + 1);
  const nums = Array.from({ length: lines.length }, (_, i) => doc.preamble.lineStart + i).slice(a, b + 1);
  const docTitle = (body.find((l) => l.startsWith('# ')) ?? body[0] ?? '').replace(/^#+\s*/, '').trim();
  const text = body.join('\n');
  return baseChunk({
    chunk_id: 'global-preamble',
    business_type: 'global',
    block: 'global',
    section_code: null,
    section_title: null,
    block_title: null,
    heading_path: [docTitle],
    chunk_type: 'prose',
    scope: 'global',
    parent_id: null,
    chunk_index: 0,
    part_index: 1,
    part_total: 1,
    line_start: nums[0] ?? 1,
    text,
    textLineNums: nums,
  });
}

function b0GroupParent(group: ParsedGroup): InternalChunk {
  const list = group.sections.map((s) => `- ${s.title}`).join('\n');
  const text = `## ${group.title}\n\nСодержит разделы:\n${list}`;
  return baseChunk({
    chunk_id: 'global-B0',
    business_type: 'global',
    block: 'global',
    section_code: 'B0',
    section_title: group.title,
    block_title: null,
    heading_path: [group.title],
    chunk_type: 'prose',
    scope: 'global',
    parent_id: null,
    chunk_index: 0,
    part_index: 1,
    part_total: 1,
    line_start: group.lineStart,
    text,
    textLineNums: [],
  });
}

function sectionParent(group: ParsedGroup, section: ParsedSection, inheritsGroupLine: boolean): InternalChunk {
  const businessType = businessTypeFor(group);
  const parentId = parentChunkId(businessType, section.code);
  const intro = trimBlank(section.introLines);
  const headingPath = group.kind === 'edge' ? [section.title] : [group.title, section.title];
  const list = section.blocks.map((b) => `- ${b.title ?? '(тело раздела — один блок)'}`).join('\n');
  const text = `## ${section.title}\n\n${intro ? intro.join('\n') + '\n\n' : ''}Содержит блоки:\n${list}`;
  return baseChunk({
    chunk_id: parentId,
    business_type: businessType,
    block: blockKindFor(group),
    section_code: section.code,
    section_title: section.title,
    block_title: null,
    heading_path: headingPath,
    chunk_type: 'prose',
    scope: section.scope,
    parent_id: null,
    chunk_index: 0,
    part_index: 1,
    part_total: 1,
    line_start: inheritsGroupLine ? group.lineStart : section.lineStart,
    text,
    textLineNums: [],
  });
}

function emitBlockChunks(group: ParsedGroup, section: ParsedSection, block: ParsedBlock, blockIndex: number, out: InternalChunk[]) {
  const businessType = businessTypeFor(group);
  const parentId = parentChunkId(businessType, section.code);
  const baseId = blockChunkId(parentId, blockIndex);
  const chunkType = chunkTypeFor(section, block);
  const parentPath = group.kind === 'edge' ? [section.title] : [group.title, section.title];
  const headingPath = block.title ? [...parentPath, block.title] : parentPath;

  const parts = splitBlock(block, chunkType, countTokens);
  const total = parts.length;
  parts.forEach((part, pi) => {
    const text = part.lines.join('\n');
    out.push(
      baseChunk({
        chunk_id: partChunkId(baseId, pi + 1, total),
        business_type: businessType,
        block: blockKindFor(group),
        section_code: section.code,
        section_title: section.title,
        block_title: block.title,
        heading_path: headingPath,
        chunk_type: chunkType,
        scope: section.scope,
        parent_id: parentId,
        chunk_index: blockIndex,
        part_index: pi + 1,
        part_total: total,
        line_start: part.lineStart,
        text,
        textLineNums: part.lineNums,
      }),
    );
  });
}

function baseChunk(fields: {
  chunk_id: string;
  business_type: string;
  block: BlockKind;
  section_code: string | null;
  section_title: string | null;
  block_title: string | null;
  heading_path: string[];
  chunk_type: ChunkType;
  scope: Scope;
  parent_id: string | null;
  chunk_index: number;
  part_index: number;
  part_total: number;
  line_start: number;
  text: string;
  textLineNums: number[];
}): InternalChunk {
  return {
    ...fields,
    source_id: CONFIG.sourceId,
    topics: [], // заполняется отдельным этапом позже (план 3, раздел 2)
    line_end: fields.line_start,
    token_count: countTokens(fields.text),
  };
}

function businessTypeFor(group: ParsedGroup): string {
  if (group.kind === 'niche') return nicheByNum(group.num!)!.businessType;
  return 'global';
}

function blockKindFor(group: ParsedGroup): BlockKind {
  if (group.kind !== 'niche') return 'global';
  return group.num! <= 5 ? 'offline' : 'online';
}

// Тип блока (план 3, раздел 6.1)
function chunkTypeFor(section: ParsedSection, block: ParsedBlock): ChunkType {
  const m = /^(\d+)\.(\d+)$/.exec(section.code);
  const title = block.title ?? '';

  if (block.explicit) {
    if (m) {
      const sub = Number(m[2]);
      if (sub === 2) {
        if (CONFIG.serviceN2Headers.includes(title)) return hasTable(block.lines) ? 'table' : 'prose';
        return 'case';
      }
      if (sub === 6) {
        if (/^SOP[- ]\d/.test(title)) return 'sop';
        if (title.includes('Чек-лист')) return 'checklist';
        if (title === 'Матрица сбоев') return 'table';
        throw new EmitError(`Неизвестный тип блока в секции ${section.code}: «${title}»`);
      }
      if (sub === 1 || sub === 7) return 'prose';
      return 'table'; // 3, 4, 5, 8
    }
    return hasTable(block.lines) ? 'table' : 'prose';
  }

  // Неявный блок — тело секции без дочерних H2. Отступление от плана 6.1
  // (N.7, 0, 11 заявлены как prose): в фактическом файле их тела — таблицы,
  // поэтому тип определяется по содержимому — иначе таблицу не дробить по строкам
  return hasTable(block.lines) ? 'table' : 'prose';
}

function hasTable(lines: string[]): boolean {
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].startsWith('|') && /^\|[-: |]+\|?$/.test(lines[i + 1].trim())) return true;
  }
  return false;
}

function trimBlank(lines: string[]): string[] {
  let a = 0;
  let b = lines.length - 1;
  while (a <= b && lines[a].trim() === '') a++;
  while (b >= a && lines[b].trim() === '') b--;
  return lines.slice(a, b + 1);
}

// --- Запись дерева папок (план 3, раздел 9.3) ---

export function toChunkFile(chunk: InternalChunk): ChunkFile {
  return {
    ...chunk,
    textLineNums: undefined,
    content_hash: crypto.createHash('sha256').update(chunk.text).digest('hex'),
  } as unknown as ChunkFile;
}

export function folderFor(group: ParsedGroup | null, section: ParsedSection | null): string[] {
  if (!section) return ['global', 'preamble']; // преамбула
  if (section.code === '0' || section.code === '11') return ['global', section.code];
  if (section.code === 'B0') return ['global', 'b0'];
  if (section.code.startsWith('B0.')) return ['global', 'b0', `global-${section.code}`];
  const niche = nicheByNum(group!.num!)!;
  const sub = section.code.split('.')[1];
  return [niche.slug, `${niche.num}-${sub}`];
}

export function writeTree(chunks: InternalChunk[], groups: ParsedGroup[], links: ChunkLink[], outDir: string): void {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  for (const chunk of chunks) {
    const group = groups.find((g) => g.sections.some((s) => s.code === chunk.section_code)) ?? null;
    const dirParts = folderFor(group, chunk.section_code ? { code: chunk.section_code } as ParsedSection : null);
    const dir = path.join(outDir, ...dirParts);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${chunk.chunk_id}.json`), JSON.stringify(toChunkFile(chunk), null, 2) + '\n', 'utf-8');
  }

  fs.writeFileSync(path.join(outDir, '_links.json'), JSON.stringify(links, null, 2) + '\n', 'utf-8');
}
