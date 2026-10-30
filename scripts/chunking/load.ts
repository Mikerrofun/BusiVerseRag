// Загрузка дерева чанков в БД (план 3, раздел 11.2). РУЧНЫЙ ШАГ:
// запускается только пользователем. По умолчанию --dry-run (план без записи),
// запись в БД — только с флагом --apply.

import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { CONFIG } from './config/chunking.config';
import { ChunkFile } from './types/chunking.types';

// подключение — по образцу scripts/database/migrate.ts
for (const name of ['.env.local', '.env']) {
  const p = path.resolve(__dirname, '../..', name);
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}

function collectJsonFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('_')) continue; // служебные файлы и папки загрузчик пропускает
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) out.push(full);
    }
  };
  walk(dir);
  // сортировка путей даёт порядок и соседство чанков (план 3, раздел 11.2)
  return out.sort();
}

// повтор попытки при сбое запроса: 3 попытки с нарастающей паузой.
// Апсёрты идемпотентны, поэтому повтор безопасен даже после частичной записи
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const delays = [1000, 2000, 4000];
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= 3) throw new Error(`${label}: не удалось после 3 попыток — ${msg}`);
      console.error(`[v0] ${label}: попытка ${attempt} упала (${msg}), повтор через ${delays[attempt - 1]} мс`);
      await new Promise((r) => setTimeout(r, delays[attempt - 1]));
    }
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const files = collectJsonFiles(CONFIG.outputDir);
  if (files.length === 0) {
    throw new Error(`Дерево ${CONFIG.outputDir} пусто — сначала запустите npm run chunk`);
  }

  const chunks: ChunkFile[] = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')));
  const links: { from_chunk_id: string; to_section: string }[] = JSON.parse(
    fs.readFileSync(path.join(CONFIG.outputDir, '_links.json'), 'utf-8'),
  );

  // --- план загрузки (одинаков для обоих режимов) ---
  const byBusiness = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const c of chunks) {
    byBusiness.set(c.business_type, (byBusiness.get(c.business_type) ?? 0) + 1);
    byType.set(c.chunk_type, (byType.get(c.chunk_type) ?? 0) + 1);
  }
  console.log(`План загрузки: ${chunks.length} чанков, ${links.length} ссылок, source_id=${CONFIG.sourceId}`);
  console.log('По нишам:');
  for (const [k, v] of [...byBusiness.entries()].sort()) console.log(`  ${k}: ${v}`);
  console.log('По типам:');
  for (const [k, v] of [...byType.entries()].sort()) console.log(`  ${k}: ${v}`);
  console.log('Первые 3 чанка в порядке загрузки:');
  for (const c of chunks.slice(0, 3)) console.log(`  ${c.chunk_id} (${c.token_count} токенов)`);
  console.log('Последние 3 чанка в порядке загрузки:');
  for (const c of chunks.slice(-3)) console.log(`  ${c.chunk_id} (${c.token_count} токенов)`);

  if (!apply) {
    console.log('\nРежим --dry-run: БД не открывалась. Для записи запустите: npm run chunk:load -- --apply');
    return;
  }

  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // строка источника нужна для FK chunks.source_id → sources.source_id
    const raw = fs.readFileSync(CONFIG.inputPath, 'utf-8');
    const docTitle = (raw.split('\n').find((l) => l.startsWith('# ')) ?? 'BusiVerse').replace(/^#+\s*/, '').trim();
    await withRetry('sources', () =>
      pool.query(
        `insert into sources (source_id, title, doc_version, valid_from, content_hash)
         values ($1, $2, $3, $4, $5)
         on conflict (source_id) do update set title = excluded.title, doc_version = excluded.doc_version,
           valid_from = excluded.valid_from, content_hash = excluded.content_hash`,
        [CONFIG.sourceId, docTitle, CONFIG.sourceId.replace('busiverse-', ''), '2026-10-13', crypto.createHash('sha256').update(raw).digest('hex')],
      ),
    );

    // повторный запуск безопасен: конфликт по chunk_id — обновление, а не дубликат.
    // При изменении текста (content_hash) старый эмбеддинг сбрасывается — он устарел
    for (const c of chunks) {
      await withRetry(`chunk ${c.chunk_id}`, () =>
        pool.query(
        `insert into chunks (chunk_id, source_id, business_type, block, section_code, section_title, block_title,
           heading_path, chunk_type, topics, scope, parent_id, chunk_index, line_start, line_end, token_count,
           text, content_hash, embedding)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NULL)
         on conflict (chunk_id) do update set
           source_id = excluded.source_id, business_type = excluded.business_type, block = excluded.block,
           section_code = excluded.section_code, section_title = excluded.section_title,
           block_title = excluded.block_title, heading_path = excluded.heading_path,
           chunk_type = excluded.chunk_type, topics = excluded.topics, scope = excluded.scope,
           parent_id = excluded.parent_id, chunk_index = excluded.chunk_index,
           line_start = excluded.line_start, line_end = excluded.line_end,
           token_count = excluded.token_count, text = excluded.text, content_hash = excluded.content_hash,
           embedding = case when chunks.content_hash is distinct from excluded.content_hash then null else chunks.embedding end`,
        [
          c.chunk_id, c.source_id, c.business_type, c.block, c.section_code, c.section_title, c.block_title,
          c.heading_path, c.chunk_type, c.topics, c.scope, c.parent_id, c.chunk_index,
          c.line_start, c.line_end, c.token_count, c.text, c.content_hash,
          ],
        ),
      );
    }

    for (const l of links) {
      await withRetry(`link ${l.from_chunk_id} → ${l.to_section}`, () =>
        pool.query(
          `insert into chunk_links (from_chunk_id, to_section) values ($1, $2)
           on conflict (from_chunk_id, to_section) do nothing`,
          [l.from_chunk_id, l.to_section],
        ),
      );
    }

    console.log(`\nЗагружено: ${chunks.length} чанков, ${links.length} ссылок. Эмбеддинги — следующий этап.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`Ошибка загрузки: ${err.message}`);
  process.exit(1);
});
