// Точка входа: нарезка очищенного файла → дерево папок с JSON + отчёт прогона
// (план 3, раздел 11). Скрипт не читает и не пишет БД.

import * as fs from 'fs';
import * as path from 'path';
import { CONFIG } from './config/chunking.config';
import { parseDocument, assertStructure, ParseError } from './lib/parse';
import { buildChunks, writeTree } from './lib/emit';
import { extractLinks } from './lib/links';
import { ChunkType, ReportStats } from './types/chunking.types';

function main() {
  const raw = fs.readFileSync(CONFIG.inputPath, 'utf-8');
  const lines = raw.split('\n');
  // трейлинг-перевод строки не является строкой файла
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const doc = parseDocument(lines);
  assertStructure(doc);

  const chunks = buildChunks(doc);
  const links = extractLinks(chunks);

  writeTree(chunks, doc.groups, links, CONFIG.outputDir);

  const report = buildReport(doc, chunks, links, lines);
  const reportPath = path.join(path.dirname(CONFIG.outputDir), 'chunking-report.md');
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(`Чанкование завершено: ${chunks.length} чанков, ${links.length} ссылок.`);
  console.log(`Дерево: ${CONFIG.outputDir}`);
  console.log(`Отчёт: ${reportPath}`);
}

function buildReport(doc: ReturnType<typeof parseDocument>, chunks: ReturnType<typeof buildChunks>, links: ReturnType<typeof extractLinks>, lines: string[]): string {
  const totalLines = lines.length;
  const stats: ReportStats = {
    niches: doc.groups.filter((g) => g.kind === 'niche').length,
    sections: doc.groups.flatMap((g) => g.sections).length,
    explicitBlocks: doc.groups.flatMap((g) => g.sections).flatMap((s) => s.blocks).filter((b) => b.explicit).length,
    implicitBlocks: doc.groups.flatMap((g) => g.sections).flatMap((s) => s.blocks).filter((b) => !b.explicit).length,
    sopBlocks: doc.groups.flatMap((g) => g.sections).flatMap((s) => s.blocks).filter((b) => /^SOP[- ]\d/.test(b.title ?? '')).length,
    chunksTotal: chunks.length,
    parents: chunks.filter((c) => c.parent_id === null && c.section_code !== null).length + 1,
    blocksTotal: chunks.filter((c) => c.parent_id !== null).length,
    partsExtra: chunks.filter((c) => c.part_total > 1).length - chunks.filter((c) => c.part_total > 1).map((c) => c.chunk_id.replace(/-p\d+$/, '')).filter((v, i, a) => a.indexOf(v) === i).length,
    byType: { sop: 0, checklist: 0, case: 0, table: 0, prose: 0 },
    tokenMin: 0,
    tokenMax: 0,
    tokenAvg: 0,
    overBudget: [],
    underBudget: [],
    links: links.length,
    notes: [],
  };

  for (const c of chunks) stats.byType[c.chunk_type]++;

  const tokens = chunks.map((c) => c.token_count);
  stats.tokenMin = Math.min(...tokens);
  stats.tokenMax = Math.max(...tokens);
  stats.tokenAvg = Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length);

  for (const c of chunks) {
    const isParent = c.parent_id === null;
    if (!isParent && c.token_count > CONFIG.budgetMax && !['case', 'sop', 'checklist'].includes(c.chunk_type)) {
      stats.overBudget.push({ chunk_id: c.chunk_id, chunk_type: c.chunk_type, token_count: c.token_count });
    }
    if (!isParent && c.token_count < CONFIG.budgetMin) {
      stats.underBudget.push({ chunk_id: c.chunk_id, token_count: c.token_count });
    }
  }

  // заметки об особых зонах, обнаруженных в файле
  const h1Count = doc.preamble.lines.filter((l) => l.startsWith('# ')).length;
  const secondH1 = lines.findIndex((l, i) => i > 0 && l.startsWith('# '));
  if (secondH1 >= 0) {
    stats.notes.push(`В файле второй H1 (строка ${secondH1 + 1}): «${lines[secondH1].trim()}» — границей не считается, вошёл в тело текущего контейнера.`);
  }
  for (const g of doc.groups) {
    const loose = g.looseLines.filter((l) => l.trim() !== '');
    if (loose.length > 0) {
      stats.notes.push(`Группа «${g.title}»: ${loose.length} строк между заголовком группы и первой секцией (не вошли в чанки).`);
    }
  }

  const out: string[] = [];
  out.push(`# Отчёт чанкования`);
  out.push('');
  out.push(`- Источник: \`${CONFIG.inputPath}\` (${totalLines} строк)`);
  out.push(`- Энкодинг токенов: \`${CONFIG.encoding}\`, бюджет ${CONFIG.budgetMin}–${CONFIG.budgetMax}`);
  out.push(`- source_id: \`${CONFIG.sourceId}\``);
  out.push('');
  out.push('## Счётчики');
  out.push('');
  out.push(`| Что | Сколько |`);
  out.push(`|---|---|`);
  out.push(`| Ниш | ${stats.niches} |`);
  out.push(`| Секций (включая сквозные) | ${stats.sections} |`);
  out.push(`| Явных блоков (H2) | ${stats.explicitBlocks} |`);
  out.push(`| Неявных блоков (тела секций без детей) | ${stats.implicitBlocks} |`);
  out.push(`| SOP-блоков | ${stats.sopBlocks} |`);
  out.push(`| Родительских чанков | ${stats.parents} |`);
  out.push(`| Блок-чанков (с кусками) | ${stats.blocksTotal} |`);
  out.push(`| Дополнительных кусков дробления | ${stats.partsExtra} |`);
  out.push(`| **Всего чанков** | **${stats.chunksTotal}** |`);
  out.push(`| Ссылок «см. раздел X» | ${stats.links} |`);
  out.push('');
  out.push('## Чанки по типам');
  out.push('');
  out.push(`| Тип | Сколько |`);
  out.push(`|---|---|`);
  for (const t of Object.keys(stats.byType) as ChunkType[]) out.push(`| ${t} | ${stats.byType[t]} |`);
  out.push('');
  out.push('## Токены');
  out.push('');
  out.push(`min ${stats.tokenMin} / max ${stats.tokenMax} / среднее ${stats.tokenAvg}`);
  out.push('');
  if (stats.overBudget.length > 0) {
    out.push(`### Вне бюджета сверху (${stats.overBudget.length})`);
    out.push('');
    for (const o of stats.overBudget) out.push(`- \`${o.chunk_id}\` — ${o.chunk_type}, ${o.token_count} токенов`);
    out.push('');
  }
  out.push(`Ниже ${CONFIG.budgetMin} токенов: ${stats.underBudget.length} чанков (короткие блоки — не ошибка, список в валидаторе).`);
  out.push('');
  out.push('## Ссылки «см. раздел X»');
  out.push('');
  if (links.length === 0) {
    out.push('Не найдено.');
  } else {
    out.push(`| from_chunk_id | to_section | строка файла |`);
    out.push(`|---|---|---|`);
    for (const l of links) out.push(`| \`${l.from_chunk_id}\` | ${l.to_section} | ${l.first_line} |`);
  }
  out.push('');
  if (stats.notes.length > 0) {
    out.push('## Заметки');
    out.push('');
    for (const n of stats.notes) out.push(`- ${n}`);
    out.push('');
  }
  return out.join('\n') + '\n';
}

try {
  main();
} catch (err) {
  if (err instanceof ParseError || err instanceof Error) {
    console.error(`Ошибка чанкования: ${err.message}`);
  }
  process.exit(1);
}
