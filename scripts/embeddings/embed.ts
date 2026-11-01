// Эмбеддинги чанков через Jina (план 01-rag-plan, раздел 6.2). РУЧНЫЙ ШАГ:
// по умолчанию dry-run, запись — только с флагом --apply.

import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { EMBED_CONFIG } from './config/embeddings.config';
import { ChunkRow, JinaResponse } from './types/embeddings.types';
import { withRetry } from '../lib/retry';

for (const name of ['.env.local', '.env.development.local', '.env']) {
  const p = path.resolve(__dirname, '../..', name);
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
}

async function fetchEmbeddings(inputs: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch(EMBED_CONFIG.jinaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: EMBED_CONFIG.model,
      task: 'retrieval.passage', // для поискового запроса на этапе поиска будет retrieval.query
      dimensions: EMBED_CONFIG.dimensions,
      normalized: true, // нормировка → косинусная близость через скалярное произведение
      input: inputs,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Jina API ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as JinaResponse;
  // Jina может вернуть данные не по порядку — восстанавливаем по index
  const out: number[][] = new Array(inputs.length);
  for (const d of json.data) out[d.index] = d.embedding;
  if (out.some((e) => !e)) throw new Error('Jina API вернул не все эмбеддинги батча');
  return out;
}

async function main() {
  const apply = process.argv.includes('--apply');

  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  if (!process.env.EMBEDING_API_JINA) throw new Error('EMBEDING_API_JINA is not set (.env.local)');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
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

    const todo = rows.filter((r) => !r.has_embedding);
    console.log(`Чанков в БД: ${rows.length}, без эмбеддинга: ${todo.length}`);

    if (todo.length === 0) {
      console.log('Все чанки уже имеют эмбеддинги.');
      return;
    }
    if (!apply) {
      console.log('Dry-run: запись не выполнялась. Для записи: npm run embed -- --apply');
      return;
    }

    const apiKey = process.env.EMBEDING_API_JINA;
    let processed = 0;

    for (let i = 0; i < todo.length; i += EMBED_CONFIG.batchSize) {
      const batch = todo.slice(i, i + EMBED_CONFIG.batchSize);
      // contextual retrieval (план 6.2): путь заголовков + текст чанка
      const inputs = batch.map((r) => `${r.heading_path.join(' > ')}\n\n${r.text}`);

      const vectors = await withRetry('jina batch', () => fetchEmbeddings(inputs, apiKey));

      for (let j = 0; j < batch.length; j++) {
        await withRetry(`update ${batch[j].chunk_id}`, () =>
          pool.query(`update chunks set embedding = $1::vector where chunk_id = $2`, [
            `[${vectors[j].join(',')}]`,
            batch[j].chunk_id,
          ]),
        );
      }

      processed += batch.length;
      if (i + EMBED_CONFIG.batchSize < todo.length) {
        await new Promise((r) => setTimeout(r, EMBED_CONFIG.batchPauseMs));
      }
    }

    console.log(`Готово: эмбеддинги записаны для ${processed} чанков.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`Ошибка эмбеддингов: ${err.message}`);
  process.exit(1);
});
