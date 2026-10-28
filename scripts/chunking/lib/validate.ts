// Валидатор дерева чанков (план 3, раздел 12).
// Режимы:
//   по умолчанию  — полная проверка (прогон только что создан скриптом);
//   --after-edit  — после ручных правок: то же, кроме покрытия строк
//                   (диапазоны информационные и могут не совпадать).
// Отчёт печатается в консоль и дописывается в data/chunking-report.md.

import * as fs from 'fs';
import * as path from 'path';
import { CONFIG } from '../config/chunking.config';
import { parseDocument, assertStructure } from './parse';
import { countTokens } from './tokens';
import { ChunkFile } from '../types/chunking.types';

interface ValidationIssue {
  check: string;
  message: string;
}

function main() {
  const afterEdit = process.argv.includes('--after-edit');
  const issues: ValidationIssue[] = [];
  const warn: string[] = [];

  const chunks = readTree(issues);
  const byId = new Map(chunks.map((c) => [c.chunk_id, c]));

  checkFieldSets(chunks, issues);
  checkIds(chunks, issues);
  checkParts(chunks, issues);
  checkBudget(chunks, issues, warn);
  checkTableHeaders(chunks, issues);
  checkProseOverlap(chunks, issues);
  checkLinks(chunks, issues);
  checkSourceStructure(issues, warn);

  if (!afterEdit) checkLineCoverage(chunks, issues);

  const errors = issues.length;
  const verdict = errors === 0 ? 'OK — все проверки зелёные' : `ОШИБКИ: ${errors}`;
  console.log(`\nВалидация (${afterEdit ? 'после ручных правок' : 'полная'}): ${verdict}`);
  for (const i of issues) console.error(`  [${i.check}] ${i.message}`);
  for (const w of warn) console.warn(`  [предупреждение] ${w}`);

  appendReport(afterEdit, errors, issues, warn, chunks.length);
  if (errors > 0) process.exit(1);
}

// --- Чтение дерева ---

function readTree(issues: ValidationIssue[]): ChunkFile[] {
  const out: ChunkFile[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // файлы и папки с префиксом _ служебные, валидатор их пропускает
      if (entry.name.startsWith('_')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) {
        try {
          out.push(JSON.parse(fs.readFileSync(full, 'utf-8')) as ChunkFile);
        } catch (e) {
          issues.push({ check: 'Формат файлов', message: `JSON не парсится: ${full}` });
        }
      }
    }
  };
  walk(CONFIG.outputDir);
  return out;
}

// --- Проверки ---

function checkFieldSets(chunks: ChunkFile[], issues: ValidationIssue[]) {
  if (chunks.length === 0) {
    issues.push({ check: 'Формат файлов', message: `Дерево ${CONFIG.outputDir} пусто — сначала запустите npm run chunk` });
    return;
  }
  const keySet = JSON.stringify(Object.keys(chunks[0]).sort());
  for (const c of chunks) {
    if (JSON.stringify(Object.keys(c).sort()) !== keySet) {
      issues.push({ check: 'Формат файлов', message: `Набор полей отличается: ${c.chunk_id}` });
    }
    if (!Array.isArray(c.topics) || c.topics.length !== 0) {
      issues.push({ check: 'Формат файлов', message: `topics должен быть пустым массивом: ${c.chunk_id}` });
    }
  }
}

function checkIds(chunks: ChunkFile[], issues: ValidationIssue[]) {
  const seen = new Set<string>();
  for (const c of chunks) {
    if (seen.has(c.chunk_id)) issues.push({ check: 'Идентификаторы', message: `Дубликат chunk_id: ${c.chunk_id}` });
    seen.add(c.chunk_id);
  }
  for (const c of chunks) {
    if (c.parent_id !== null && !seen.has(c.parent_id)) {
      issues.push({ check: 'Идентификаторы', message: `parent_id указывает на несуществующий чанк: ${c.parent_id} (у ${c.chunk_id})` });
    }
  }
}

function baseIdOf(c: ChunkFile): string {
  return c.part_total > 1 ? c.chunk_id.replace(/-p\d+$/, '') : c.chunk_id;
}

function checkParts(chunks: ChunkFile[], issues: ValidationIssue[]) {
  const groups = new Map<string, ChunkFile[]>();
  for (const c of chunks) {
    if (c.parent_id === null) continue;
    const base = baseIdOf(c);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push(c);
  }
  for (const [base, list] of groups) {
    const totals = new Set(list.map((c) => c.part_total));
    if (totals.size !== 1) issues.push({ check: 'Идентификаторы', message: `part_total расходится внутри ${base}` });
    const total = list[0].part_total;
    const indexes = list.map((c) => c.part_index).sort((a, b) => a - b);
    if (indexes.length !== total || indexes.some((v, i) => v !== i + 1)) {
      issues.push({ check: 'Идентификаторы', message: `part_index не образует 1..${total} у ${base}: ${indexes.join(',')}` });
    }
  }
}

function checkBudget(chunks: ChunkFile[], issues: ValidationIssue[], warn: string[]) {
  for (const c of chunks) {
    const recounted = countTokens(c.text);
    if (recounted !== c.token_count) {
      warn.push(`token_count не совпадает с пересчётом (${c.token_count} → ${recounted}): ${c.chunk_id}`);
    }
    // родительские чанки и преамбула не индексируются — бюджет к ним не применяется
    if (c.parent_id === null) continue;
    // только кейсы, SOP и чек-листы имеют право превышать 700 (план 3, раздел 12)
    if (recounted > CONFIG.budgetMax && !['case', 'sop', 'checklist'].includes(c.chunk_type)) {
      issues.push({ check: 'Бюджет', message: `${c.chunk_id} (${c.chunk_type}) — ${recounted} токенов > ${CONFIG.budgetMax}` });
    }
  }
}

function checkTableHeaders(chunks: ChunkFile[], issues: ValidationIssue[]) {
  const byBase = new Map<string, ChunkFile[]>();
  for (const c of chunks) {
    if (c.chunk_type !== 'table' || c.parent_id === null) continue;
    const base = baseIdOf(c);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base)!.push(c);
  }
  for (const [base, list] of byBase) {
    const sorted = [...list].sort((a, b) => a.part_index - b.part_index);
    const isSep = (l: string) => /^\|[-: |]+\|?$/.test(l.trim());
    // блок заявлен как table, но таблицы в нём нет ни в одном куске — ошибка классификации
    const hasTableRows = sorted.some((p) => p.text.split('\n').some((l) => l.startsWith('|') && !isSep(l)));
    if (!hasTableRows) {
      issues.push({ check: 'Таблицы', message: `В табличном блоке нет ни одной таблицы: ${base}` });
      continue;
    }
    for (const part of sorted) {
      // шапка (строка '|' + разделитель) должна стоять непосредственно перед первой
      // строкой данных куска. Кусок без строк таблицы (текстовый хвост) шапки не требует
      const lines = part.text.split('\n');
      const rowIdx = lines.findIndex((l) => l.startsWith('|') && !isSep(l));
      if (rowIdx === -1) continue;
      const ok = rowIdx >= 2 && lines[rowIdx - 2].startsWith('|') && isSep(lines[rowIdx - 1]);
      if (!ok) {
        issues.push({ check: 'Таблицы', message: `Кусок без шапки перед строками данных: ${part.chunk_id}` });
      }
    }
  }
}

function paragraphsOf(text: string): string[] {
  return text
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p !== '');
}

function checkProseOverlap(chunks: ChunkFile[], issues: ValidationIssue[]) {
  const byBase = new Map<string, ChunkFile[]>();
  for (const c of chunks) {
    if (c.chunk_type !== 'prose' || c.parent_id === null || c.part_total === 1) continue;
    const base = baseIdOf(c);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base)!.push(c);
  }
  for (const [base, list] of byBase) {
    const sorted = [...list].sort((a, b) => a.part_index - b.part_index);
    for (let i = 1; i < sorted.length; i++) {
      const prevParas = paragraphsOf(sorted[i - 1].text);
      const curParas = paragraphsOf(sorted[i].text);
      const prevLast = prevParas[prevParas.length - 1];
      const curFirst = curParas[0];
      if (prevLast !== curFirst) {
        issues.push({ check: 'Перекрытие прозы', message: `Первый абзац ${sorted[i].chunk_id} ≠ последнему абзацу ${sorted[i - 1].chunk_id}` });
      }
    }
  }
}

function checkLinks(chunks: ChunkFile[], issues: ValidationIssue[]) {
  const linksPath = path.join(CONFIG.outputDir, '_links.json');
  if (!fs.existsSync(linksPath)) {
    issues.push({ check: 'Ссылки', message: `_links.json не найден в ${CONFIG.outputDir}` });
    return;
  }
  let links: { from_chunk_id: string; to_section: string }[];
  try {
    links = JSON.parse(fs.readFileSync(linksPath, 'utf-8'));
  } catch {
    issues.push({ check: 'Ссылки', message: '_links.json не парсится' });
    return;
  }
  const ids = new Set(chunks.map((c) => c.chunk_id));
  for (const l of links) {
    if (!CONFIG.linkWhitelist.includes(l.to_section)) {
      issues.push({ check: 'Ссылки', message: `to_section вне белого списка: ${l.to_section} (из ${l.from_chunk_id})` });
    }
    if (!ids.has(l.from_chunk_id)) {
      issues.push({ check: 'Ссылки', message: `from_chunk_id не существует: ${l.from_chunk_id}` });
    }
  }
}

function checkSourceStructure(issues: ValidationIssue[], warn: string[]) {
  const raw = fs.readFileSync(CONFIG.inputPath, 'utf-8');
  const lines = raw.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const doc = parseDocument(lines);
  try {
    assertStructure(doc);
  } catch (e) {
    issues.push({ check: 'Структура', message: (e as Error).message });
    return;
  }

  // служебные заголовки N.2: фиксированный список, проверяется по всем 10 нишам
  for (const g of doc.groups.filter((x) => x.kind === 'niche')) {
    const n2 = g.sections.find((s) => s.code === `${g.num}.2`);
    if (!n2) continue;
    const titles = n2.blocks.filter((b) => b.explicit).map((b) => b.title ?? '');
    const expected = [...CONFIG.serviceN2Headers].sort();
    const found = titles.filter((t) => CONFIG.serviceN2Headers.includes(t)).sort();
    if (JSON.stringify(found) !== JSON.stringify(expected)) {
      issues.push({
        check: 'Служебные заголовки N.2',
        message: `Ниша ${g.num}: найдено [${found.join('; ')}], ожидалось [${expected.join('; ')}]. Все заголовки N.2: [${titles.join('; ')}]`,
      });
    }
  }

  for (const g of doc.groups) {
    const loose = g.looseLines.filter((l) => l.trim() !== '');
    if (loose.length > 0) warn.push(`Группа «${g.title}»: ${loose.length} строк между заголовком группы и первой секцией не вошли в чанки`);
  }
}

function checkLineCoverage(chunks: ChunkFile[], issues: ValidationIssue[]) {
  const raw = fs.readFileSync(CONFIG.inputPath, 'utf-8');
  const totalLines = raw.split('\n').length - (raw.endsWith('\n') ? 1 : 0);
  const sorted = [...chunks].sort((a, b) => a.line_start - b.line_start || a.chunk_id.localeCompare(b.chunk_id));
  if (sorted.length === 0) return;
  if (sorted[0].line_start !== 1) {
    issues.push({ check: 'Покрытие строк', message: `Первый чанк начинается со строки ${sorted[0].line_start}, а не 1` });
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].line_start !== sorted[i - 1].line_end + 1) {
      issues.push({
        check: 'Покрытие строк',
        message: `Дыра или перекрытие между ${sorted[i - 1].chunk_id} (конец ${sorted[i - 1].line_end}) и ${sorted[i].chunk_id} (начало ${sorted[i].line_start})`,
      });
    }
  }
  const last = sorted[sorted.length - 1];
  if (last.line_end !== totalLines) {
    issues.push({ check: 'Покрытие строк', message: `Последний чанк заканчивается строкой ${last.line_end}, в файле ${totalLines}` });
  }
}

// --- Отчёт ---

function appendReport(afterEdit: boolean, errors: number, issues: ValidationIssue[], warn: string[], total: number) {
  const reportPath = path.join(path.dirname(CONFIG.outputDir), 'chunking-report.md');
  const stamp = new Date().toISOString();
  const out: string[] = [];
  out.push('');
  out.push(`## Валидация ${stamp} (${afterEdit ? 'после ручных правок' : 'полная'}, чанков: ${total})`);
  out.push('');
  out.push(`Результат: **${errors === 0 ? 'OK — все проверки зелёные' : `ошибок: ${errors}`}**; предупреждений: ${warn.length}`);
  if (issues.length > 0) {
    out.push('');
    for (const i of issues) out.push(`- [${i.check}] ${i.message}`);
  }
  if (warn.length > 0) {
    out.push('');
    out.push('Предупреждения:');
    for (const w of warn) out.push(`- ${w}`);
  }
  out.push('');
  try {
    fs.appendFileSync(reportPath, out.join('\n') + '\n', 'utf-8');
  } catch {
    // отчёт не критичен для результата валидации
  }
}

main();
