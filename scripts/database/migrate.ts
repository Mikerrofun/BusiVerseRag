import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

async function migrate() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('Starting migration...');
    
    // Read migration file
    const migrationPath = path.join(__dirname, '../../db/migrations/0000_initial_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    // Execute migration
    await pool.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('\nCreated tables:');
    console.log('  - sources');
    console.log('  - chunks (with pgvector extension)');
    console.log('  - chunk_links');
    console.log('\nCreated indexes:');
    console.log('  - chunks_embedding_idx (HNSW for vector search)');
    console.log('  - chunks_tsv_idx (GIN for full-text search)');
    console.log('  - chunks_filter_idx (business_type, section_code)');
    console.log('  - chunks_scope_idx (scope)');
    console.log('  - chunks_parent_idx (parent_id)');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);
