// Дробление блоков по типам (план 3, раздел 6.2). Бюджет: 500–700 токенов.
// Блок ≤ 700 токенов → один чанк. Блок > 700 → дробится по правилам типа:
//   table      — по группам строк, шапка повторяется в каждом куске;
//   prose      — по границам абзацев, перекрытие = последний абзац предыдущего куска;
//   case/sop/checklist — не режутся никогда.
//
// Функции чистые: счётчик токенов передаётся снаружи (в тестах — фейковый).

import { CONFIG } from '../config/chunking.config';
import { ChunkType, ParsedBlock, SplitPart } from '../types/chunking.types';

export type TokenCounter = (text: string) => number;

interface Segment {
  kind: 'text' | 'row';
  lines: string[]; // у text-сегмента — абзац плюс следующие за ним пустые строки
  lineNums: number[];
  startLine: number;
  tokens: number;
  // у row-сегмента: шапка таблицы, к которой относится строка
  header?: { lines: string[]; lineNums: number[]; startLine: number; tokens: number };
}

const NO_SPLIT_TYPES: ChunkType[] = ['case', 'sop', 'checklist'];

export function splitBlock(block: ParsedBlock, chunkType: ChunkType, countTokens: TokenCounter): SplitPart[] {
  const trimmed = trimEdges(block.lines, seqNums(block.lineStart, block.lines.length));
  if (NO_SPLIT_TYPES.includes(chunkType) || countTokens(trimmed.lines.join('\n')) <= CONFIG.budgetMax) {
    return [singlePart(trimmed)];
  }
  if (chunkType === 'prose') return splitProse(trimmed, countTokens);
  return splitTable(trimmed, countTokens);
}

// --- Проза: по границам абзацев, перекрытие последним абзацем ---

function splitProse(body: Trimmed, count: TokenCounter): SplitPart[] {
  const segments = paragraphSegments(body, count);
  const packed = packSegments(segments, count);
  if (packed.length <= 1) return [singlePart(body)];

  const parts: SplitPart[] = [];
  for (let i = 0; i < packed.length; i++) {
    // перекрытие: последний абзац предыдущего куска целиком, даже если он больше 15% бюджета.
    // Заголовок блока перекрытием не бывает — он и так есть в куске 1 и в heading_path
    const overlap = i > 0 ? clone(lastContentSegment(packed[i - 1])) : null;
    const own = packed[i];
    const segs = overlap ? [overlap, ...own] : [...own];
    let tokens = segs.reduce((s, x) => s + x.tokens, 0);

    // балансировка: если перекрытие вытолкнуло кусок за бюджет — переносим
    // последний собственный абзац в следующий кусок (порядок документа сохраняется)
    while (tokens > CONFIG.budgetMax && own.length > 1 && i < packed.length - 1) {
      const moved = own.pop()!;
      segs.splice(segs.indexOf(moved), 1);
      tokens -= moved.tokens;
      packed[i + 1].unshift(moved);
    }

    const newStart = i > 0 ? own[0].startLine : firstNonBlankLine(body);
    parts.push(assemble(segs, newStart));
  }
  return parts;
}

// --- Таблица: по группам строк, шапка повторяется в каждом куске ---

// Стоимость сегмента для бюджета группы: строка таблицы учитывается вместе с шапкой,
// если шапки этой таблицы ещё нет в группе (план 3, раздел 6.2 — шапка в каждом куске)
function segCost(seg: Segment, headers: Set<NonNullable<Segment['header']>>): number {
  if (seg.kind === 'row' && !headers.has(seg.header!)) return seg.tokens + seg.header!.tokens;
  return seg.tokens;
}

function groupTokens(group: Segment[]): number {
  const headers = new Set(group.filter((s) => s.kind === 'row').map((s) => s.header!));
  let tokens = group.reduce((s, x) => s + x.tokens, 0);
  for (const h of headers) tokens += h.tokens;
  return tokens;
}

function splitTable(body: Trimmed, count: TokenCounter): SplitPart[] {
  const segments = tableSegments(body, count);

  // жадная упаковка сегментов в группы в пределах бюджета (шапка входит в стоимость)
  const groups: Segment[][] = [];
  let cur: Segment[] = [];
  let curTokens = 0;
  let curHeaders = new Set<NonNullable<Segment['header']>>();
  for (const seg of segments) {
    if (cur.length > 0 && curTokens + segCost(seg, curHeaders) > CONFIG.budgetMax) {
      groups.push(cur);
      cur = [];
      curTokens = 0;
      curHeaders = new Set();
    }
    // стоимость считаем ПОСЛЕ возможного сброса: первая строка новой группы
    // платит за шапку своей таблицы (иначе кусок вылезает за бюджет)
    const cost = segCost(seg, curHeaders);
    cur.push(seg);
    curTokens += cost;
    if (seg.kind === 'row') curHeaders.add(seg.header!);
  }
  if (cur.length) groups.push(cur);

  // балансировка: группы строк подбираются так, чтобы кусок попадал в 500–700.
  // Хвостовую группу догоняем сегментами из предыдущей, пока она ниже floor;
  // предыдущая группа при этом не должна упасть ниже того же floor
  for (let i = groups.length - 1; i > 0; i--) {
    while (groupTokens(groups[i]) < CONFIG.rebalanceFloorTokens && groups[i - 1].length > 1) {
      const moved = groups[i - 1][groups[i - 1].length - 1];
      const cost = segCost(moved, new Set(groups[i].filter((s) => s.kind === 'row').map((s) => s.header!)));
      if (groupTokens(groups[i]) + cost > CONFIG.budgetMax) break;
      if (groupTokens(groups[i - 1]) - moved.tokens < CONFIG.rebalanceFloorTokens) break;
      groups[i - 1].pop();
      groups[i].unshift(moved);
    }
  }

  // сборка кусков: шапка ставится непосредственно перед строками своей таблицы
  const parts: SplitPart[] = [];
  const emittedHeaders = new Set<NonNullable<Segment['header']>>();
  for (const group of groups) {
    const lines: string[] = [];
    const lineNums: number[] = [];
    let newStart = -1; // первая строка НОВОГО содержимого куска
    let headerInPart: Segment['header'] = null;
    for (const seg of group) {
      if (seg.kind === 'row') {
        if (headerInPart !== seg.header) {
          lines.push(...seg.header!.lines);
          lineNums.push(...seg.header!.lineNums);
          headerInPart = seg.header;
          if (!emittedHeaders.has(seg.header!)) {
            emittedHeaders.add(seg.header!);
            if (newStart < 0) newStart = seg.header!.startLine; // шапка этой таблицы здесь впервые — новое содержимое
          }
        }
        if (newStart < 0) newStart = seg.startLine;
      } else if (newStart < 0) {
        newStart = seg.startLine;
      }
      lines.push(...seg.lines);
      lineNums.push(...seg.lineNums);
    }
    const trimmed = trimEdges(lines, lineNums);
    parts.push({
      lines: trimmed.lines,
      lineNums: trimmed.lineNums,
      lineStart: Math.max(newStart, trimmed.lineNums[0] ?? newStart),
    });
  }
  return parts;
}

// --- Сегменты ---

interface Trimmed {
  lines: string[];
  lineNums: number[];
}

function trimEdges(lines: string[], nums: number[]): Trimmed {
  let a = 0;
  let b = lines.length - 1;
  while (a <= b && lines[a].trim() === '') a++;
  while (b >= a && lines[b].trim() === '') b--;
  return { lines: lines.slice(a, b + 1), lineNums: nums.slice(a, b + 1) };
}

function seqNums(start: number, len: number): number[] {
  return Array.from({ length: len }, (_, i) => start + i);
}

function singlePart(body: Trimmed): SplitPart {
  return { lines: body.lines, lineNums: body.lineNums, lineStart: body.lineNums[0] };
}

function firstNonBlankLine(body: Trimmed): number {
  const idx = body.lines.findIndex((l) => l.trim() !== '');
  return idx >= 0 ? body.lineNums[idx] : body.lineNums[0];
}

// Абзац = идущие подряд непустые строки плюс следующие за ними пустые строки.
// Так при склейке кусков внутренняя пустая структура сохраняется как есть.
function paragraphSegments(body: Trimmed, count: TokenCounter): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  while (i < body.lines.length) {
    if (body.lines[i].trim() === '') {
      i++;
      continue;
    }
    const startIdx = i;
    while (i < body.lines.length && body.lines[i].trim() !== '') i++;
    while (i < body.lines.length && body.lines[i].trim() === '') i++;
    const lines = body.lines.slice(startIdx, i);
    const lineNums = body.lineNums.slice(startIdx, i);
    // +1 токен на строку: при склейке строк текста переводы строк тоже стоят токенов —
    // запас делает упаковку чуть консервативнее, чтобы кусок не вылез за бюджет
    segments.push({ kind: 'text', lines, lineNums, startLine: lineNums[0], tokens: count(lines.join('\n')) + lines.length });
  }
  return segments;
}

// Разбор тела табличного блока: таблицы (шапка + строки-сегменты) и текстовые абзацы.
function tableSegments(body: Trimmed, count: TokenCounter): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  while (i < body.lines.length) {
    if (!body.lines[i].startsWith('|')) {
      // текстовый абзац вне таблицы
      const startIdx = i;
      while (i < body.lines.length && !body.lines[i].startsWith('|') && body.lines[i].trim() !== '') i++;
      while (i < body.lines.length && !body.lines[i].startsWith('|') && body.lines[i].trim() === '') i++;
      const lines = body.lines.slice(startIdx, i);
      const lineNums = body.lineNums.slice(startIdx, i);
      const seg: Segment = { kind: 'text', lines, lineNums, startLine: lineNums[0], tokens: count(lines.join('\n')) + lines.length };
      segments.push(...splitOversizeText(seg, count));
      continue;
    }
    // таблица: шапка = строки до разделителя + сам разделитель (план 3, раздел 6.2)
    const headerStart = i;
    let j = i + 1;
    const isSeparator = (l: string) => /^\|[-: |]+\|?$/.test(l.trim());
    if (j < body.lines.length && isSeparator(body.lines[j])) {
      const header = {
        lines: [body.lines[i], body.lines[j]],
        lineNums: [body.lineNums[i], body.lineNums[j]],
        startLine: body.lineNums[i],
        tokens: count(`${body.lines[i]}\n${body.lines[j]}`) + 2,
      };
      j++;
      while (j < body.lines.length && body.lines[j].startsWith('|')) {
        segments.push({
          kind: 'row',
          lines: [body.lines[j]],
          lineNums: [body.lineNums[j]],
          startLine: body.lineNums[j],
          tokens: count(body.lines[j]) + 1,
          header,
        });
        j++;
      }
      i = j;
    } else {
      // таблица без разделителя — не дробится, идёт как текстовый сегмент
      while (i < body.lines.length && body.lines[i].startsWith('|')) i++;
      const lines = body.lines.slice(headerStart, i);
      const lineNums = body.lineNums.slice(headerStart, i);
      segments.push({ kind: 'text', lines, lineNums, startLine: lineNums[0], tokens: count(lines.join('\n')) + lines.length });
    }
  }
  return segments;
}

// Гигантский текстовый сегмент внутри табличного блока режется по абзацам (без перекрытия)
function splitOversizeText(seg: Segment, count: TokenCounter): Segment[] {
  if (seg.tokens <= CONFIG.budgetMax) return [seg];
  const paras = paragraphSegments({ lines: seg.lines, lineNums: seg.lineNums }, count);
  const out: Segment[] = [];
  let cur: Segment[] = [];
  let toks = 0;
  for (const p of paras) {
    if (cur.length > 0 && toks + p.tokens > CONFIG.budgetMax) {
      out.push(mergeSegments(cur));
      cur = [];
      toks = 0;
    }
    cur.push(p);
    toks += p.tokens;
  }
  if (cur.length) out.push(mergeSegments(cur));
  return out;
}

function mergeSegments(segs: Segment[]): Segment {
  const lines = segs.flatMap((s) => s.lines);
  const lineNums = segs.flatMap((s) => s.lineNums);
  return { kind: 'text', lines, lineNums, startLine: lineNums[0], tokens: segs.reduce((s, x) => s + x.tokens, 0) };
}

// Жадная упаковка абзацев в куски в пределах бюджета
function packSegments(segments: Segment[], count: TokenCounter): Segment[][] {
  const packed: Segment[][] = [];
  let cur: Segment[] = [];
  let toks = 0;
  for (const seg of segments) {
    if (cur.length > 0 && toks + seg.tokens > CONFIG.budgetMax) {
      packed.push(cur);
      cur = [];
      toks = 0;
    }
    cur.push(seg);
    toks += seg.tokens;
  }
  if (cur.length) packed.push(cur);
  return packed;
}

// последний сегмент-абзац, не являющийся заголовком блока
function lastContentSegment(list: Segment[]): Segment | null {
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i].lines[0].startsWith('## ')) return list[i];
  }
  return null;
}

function clone(seg: Segment): Segment {
  return { ...seg, lines: [...seg.lines], lineNums: [...seg.lineNums] };
}

// Склейка сегментов в кусок. Между абзацами гарантируется пустая строка,
// если предыдущий сегмент её не оставил (край тела блока).
function assemble(segs: Segment[], newStart: number): SplitPart {
  const lines: string[] = [];
  const lineNums: number[] = [];
  segs.forEach((seg, idx) => {
    if (idx > 0 && needsBlankSeparator(lines, seg)) {
      lines.push('');
      lineNums.push(lineNums[lineNums.length - 1]);
    }
    lines.push(...seg.lines);
    lineNums.push(...seg.lineNums);
  });
  const trimmed = trimEdges(lines, lineNums);
  return { lines: trimmed.lines, lineNums: trimmed.lineNums, lineStart: newStart };
}

function needsBlankSeparator(lines: string[], next: Segment): boolean {
  if (lines.length === 0 || next.lines.length === 0) return false;
  return lines[lines.length - 1].trim() !== '' && next.lines[0].trim() !== '';
}
