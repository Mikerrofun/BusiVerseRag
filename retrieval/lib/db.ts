import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { MODELS_CONFIG } from '../config/models.config';

// dotenv-загрузка по паттерну scripts/embeddings/embed.ts
for (const name of ['.env.local', '.env.development.local', '.env']) {
  const p = path.resolve(__dirname, '../..', name);
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const url = process.env[MODELS_CONFIG.env.databaseUrl];
  if (!url) {
    throw new Error(
      `${MODELS_CONFIG.env.databaseUrl} is not set — без него retrieval не подключится к Neon`,
    );
  }
  pool = new Pool({ connectionString: url });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Общая выборка полей чанка для всех SQL-запросов конвейера */
export const CHUNK_COLUMNS = `chunk_id, business_type, block, section_code, section_title, block_title,
  heading_path, chunk_type, scope, parent_id, chunk_index, line_start, token_count, text`;

/** Опциональный фильтр ниши: одна и та же функция поиска работает с фильтром и без */
export function nicheFilter(niche: string | null, paramIndex: number): string {
  return niche ? `and (business_type = $${paramIndex} or scope = 'global')` : '';
}
