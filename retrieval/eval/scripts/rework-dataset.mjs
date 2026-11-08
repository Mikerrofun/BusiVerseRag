// Одноразовый скрипт переработки eval-датасета (план evalImprove, задача 2):
// 1) удаляет 10 global-вопросов и 5 слабых easy-niche-вопросов
// 2) переводит q-niche-04 из easy в medium
// 3) расширяет expected_chunk_ids до уровня блока (все части блока) по data/chunks
// 4) проверяет, что все expected-части существуют в чанках
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = '/vercel/share/v0-project';
const CHUNKS_DIR = join(ROOT, 'data/chunks');
const QUESTIONS_PATH = join(ROOT, 'retrieval/eval/questions.jsonl');

// --- 1. Индекс чанков ---
const allChunkIds = new Set();
const blockParts = new Map(); // base -> Map(partNo -> chunk_id)

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      walk(p);
    } else if (entry.endsWith('.json') && !entry.startsWith('_')) {
      const json = JSON.parse(readFileSync(p, 'utf8'));
      const id = json.chunk_id ?? entry.replace(/\.json$/, '');
      allChunkIds.add(id);
      const m = id.match(/^(.*?)-p(\d+)$/);
      const base = m ? m[1] : id;
      const partNo = m ? Number(m[2]) : 0;
      if (!blockParts.has(base)) blockParts.set(base, new Map());
      blockParts.get(base).set(partNo, id);
    }
  }
}
walk(CHUNKS_DIR);

function expandToBlock(id) {
  if (allChunkIds.has(id)) {
    // уже существует: либо одночастный блок, либо конкретная часть
    const m = id.match(/^(.*?)-p(\d+)$/);
    if (!m) return [id]; // одночастный блок — оставляем как есть
    const parts = blockParts.get(m[1]);
    return [...parts.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }
  // id не существует: пробуем как базу блока (bXX -> bXX-p1..pN)
  const parts = blockParts.get(id);
  if (parts) {
    return [...parts.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }
  return null; // не найдено вовсе
}

// --- 2. Правила переработки ---
const REMOVE = new Set(['q-niche-01', 'q-niche-03', 'q-niche-12', 'q-niche-15', 'q-niche-27']);
const TO_MEDIUM = new Set(['q-niche-04']);

const questions = readFileSync(QUESTIONS_PATH, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

const kept = [];
const missing = [];
const expansions = [];

for (const q of questions) {
  if (q.group === 'global') continue; // 2.1: global-вопросы удаляются
  if (REMOVE.has(q.qid)) continue;    // 2.2: шаблонные/дублирующие easy
  if (TO_MEDIUM.has(q.qid)) q.difficulty = 'medium'; // 2.5: переразметка сложности

  // 2.3: expected на уровне блоков
  const expanded = [];
  for (const id of q.expected_chunk_ids) {
    const parts = expandToBlock(id);
    if (!parts) {
      missing.push(`${q.qid}: ${id}`);
      expanded.push(id);
      continue;
    }
    if (parts.length > 1 || parts[0] !== id) {
      expansions.push(`${q.qid}: ${id} -> ${parts.join(', ')}`);
    }
    expanded.push(...parts);
  }
  q.expected_chunk_ids = [...new Set(expanded)];
  kept.push(q);
}

// --- 3. Отчёт и запись ---
const byDifficulty = {};
const byGroup = {};
for (const q of kept) {
  byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] ?? 0) + 1;
  byGroup[q.group] = (byGroup[q.group] ?? 0) + 1;
}
console.log('Total:', kept.length);
console.log('By difficulty:', byDifficulty);
console.log('By group:', byGroup);
console.log('\nExpansions:');
for (const e of expansions) console.log('  ' + e);
if (missing.length) {
  console.log('\nMISSING CHUNK IDS:');
  for (const m of missing) console.log('  ' + m);
  process.exit(1);
}

writeFileSync(QUESTIONS_PATH, kept.map((q) => JSON.stringify(q)).join('\n') + '\n');
console.log('\nWritten:', relative(ROOT, QUESTIONS_PATH));
