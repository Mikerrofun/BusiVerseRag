// Эмбеддинги чанков через Jina AI (план 01-rag-plan, раздел 6.2). РУЧНЫЙ ШАГ:
// запускается только пользователем. По умолчанию --dry-run (только чтение БД
// и план), запись эмбеддингов — только с флагом --apply.
//
// Что эмбеддим: heading_path + текст чанка (contextual retrieval, план 6.2).
// Модель: jina-embeddings-v5-omni-small, 1024 размерности — совпадает с
// vector(1024) в схеме БД (docs/feature/database-architecture.md).
// Ключ: EMBEDING_API_JINA из .env.local.

import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// .env.local — локальные ключи пользователя; .env.development.local — env проекта v0
for (const name of ['.env.local', '.env.development.local', '.env']) {
  const p = path.resolve(__dirname, '../..', name);
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
}

const JINA_URL = 'https://api.jina.ai/v1/embeddings';
const MODEL = 'jina-embeddings-v5-omni-small';
const DIMENSIONS = 1024; // зафиксировано в схеме: chunks.embedding vector(1024)
const BATCH_SIZE = 32; // чанков на один запрос к Jina
const BATCH_PAUSE_MS = 500; // пауза между батчами (rate limit Jina)

interface ChunkRow {
  chunk_id: string;
  text: string;
  heading_path: string[];
  content_hash: string;
  has_embedding: boolean;
}

// повтор попытки: 3 попытки с нарастающей паузой. Запись идемпотентна
// (UPDATE по chunk_id), поэтому повтор безопасен даже после частичной записи
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

async function fetchEmbeddings(inputs: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch(JINA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      task: 'retrieval.passage', // эмбеддинг документов; для поискового запроса будет retrieval.query
      dimensions: DIMENSIONS,
      normalized: true, // нормировка → косинусная близость через скалярное произведение
      input: inputs,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Jina API ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  // Jina может вернуть данные не по порядку — восстанавливаем по index
  const out: number[][] = new Array(inputs.length);
  for (const d of json.data) out[d.index] = d.embedding;
  if (out.some((e) => !e)) throw new Error('Jina API вернул не все эмбеддинги батча');
  return out;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const force = process.argv.includes('--force'); // пере-эмбеддить даже уже готовые чанки

  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  if (!process.env.EMBEDING_API_JINA) throw new Error('EMBEDING_API_JINA is not set (.env.local)');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // читаем все чанки: текст, путь заголовков и признак готового эмбеддинга
    const { rows } = await withRetry('select chunks', () =>
      pool.query<ChunkRow>(
        `select chunk_id, text, heading_path, content_hash,
                (embedding is not null) as has_embedding
         from chunks
         order by chunk_id`,
      ),
    );

    if (rows.length === 0) {
      throw new Error('Таблица chunks пуста — сначала запустите npm run chunk:load -- --apply');
    }

    // --- план (одинаков для обоих режимов) ---
    const todo = force ? rows : rows.filter((r) => !r.has_embedding);
    const done = rows.length - todo.length;
    const byBusiness = new Map<string, number>();
    for (const r of todo) {
      const bt = r.chunk_id.split('::')[0]; // chunk_id начинается с business_type
      byBusiness.set(bt, (byBusiness.get(bt) ?? 0) + 1);
    }
    console.log(`План эмбеддингов: всего ${rows.length} чанков, уже с эмбеддингом ${done}, к обработке ${todo.length}`);
    if (force && done > 0) console.log('Флаг --force: пере-эмбеддим в том числе уже готовые чанки');
    for (const [k, v] of [...byBusiness.entries()].sort()) console.log(`  ${k}: ${v}`);
    console.log(`Модель: ${MODEL}, размерность: ${DIMENSIONS}, батч: ${BATCH_SIZE}`);
    console.log('Первые 3 чанка в порядке обработки:');
    for (const r of todo.slice(0, 3)) console.log(`  ${r.chunk_id} (${r.text.length} символов)`);

    if (todo.length === 0) {
      console.log('\nВсе чанки уже имеют эмбеддинги. Для пере-эмбеддинга запустите с --force');
      return;
    }

    if (!apply) {
      console.log('\nРежим --dry-run: запись не выполнялась. Для записи запустите: npm run embed -- --apply');
      return;
    }

    const apiKey = process.env.EMBEDING_API_JINA;
    let processed = 0;
    const startedAt = Date.now();

    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
      const batch = todo.slice(i, i + BATCH_SIZE);
      // contextual retrieval (план 6.2): путь заголовков + текст чанка
      const inputs = batch.map((r) => `${r.heading_path.join(' > ')}\n\n${r.text}`);

      const vectors = await withRetry(`jina batch ${i / BATCH_SIZE + 1}`, () => fetchEmbeddings(inputs, apiKey));

      for (let j = 0; j < batch.length; j++) {
        const literal = `[${vectors[j].join(',')}]`;
        await withRetry(`update ${batch[j].chunk_id}`, () =>
          pool.query(`update chunks set embedding = $1::vector where chunk_id = $2`, [literal, batch[j].chunk_id]),
        );
      }

      processed += batch.length;
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      console.log(`[${processed}/${todo.length}] записано (${elapsed} с)`);
      if (i + BATCH_SIZE < todo.length) await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
    }

    console.log(`\nГотово: эмбеддинги записаны для ${processed} чанков.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`Ошибка эмбеддингов: ${err.message}`);
  process.exit(1);
});
