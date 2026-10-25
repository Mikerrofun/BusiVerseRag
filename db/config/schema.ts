import { pgTable, text, integer, date, index, primaryKey, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Custom type for pgvector
const vector = customType<{ data: number[]; driverData: string }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
});

// Sources table - documents that are chunked
export const sources = pgTable('sources', {
  sourceId: text('source_id').primaryKey(),
  title: text('title').notNull(),
  docVersion: text('doc_version').notNull(),
  validFrom: date('valid_from').notNull(),
  contentHash: text('content_hash').notNull(),
});

// Chunks table - individual pieces of content with embeddings
export const chunks = pgTable('chunks', {
  chunkId: text('chunk_id').primaryKey(),
  sourceId: text('source_id').notNull().references(() => sources.sourceId),
  businessType: text('business_type').notNull(),
  block: text('block').notNull(),
  sectionCode: text('section_code'),
  sectionTitle: text('section_title'),
  blockTitle: text('block_title'),
  headingPath: text('heading_path').array().notNull().default(sql`'{}'::text[]`),
  chunkType: text('chunk_type').notNull(),
  topics: text('topics').array().notNull().default(sql`'{}'::text[]`),
  scope: text('scope').notNull().default('business'),
  parentId: text('parent_id'),
  chunkIndex: integer('chunk_index').notNull().default(0),
  lineStart: integer('line_start'),
  lineEnd: integer('line_end'),
  tokenCount: integer('token_count').notNull(),
  text: text('text').notNull(),
  contentHash: text('content_hash').notNull(),
  // Vector embedding with dimension 1024
  embedding: vector('embedding', { dimensions: 1024 }),
}, (table) => ({
  // HNSW index for vector similarity search using cosine distance
  embeddingIdx: index('chunks_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
  // GIN index for full-text search on generated tsv column
  tsvIdx: index('chunks_tsv_idx').using('gin', sql`tsv`),
  // Composite index for filtering by business type and section
  filterIdx: index('chunks_filter_idx').on(table.businessType, table.sectionCode),
  // Index for scope filtering (global vs business-specific)
  scopeIdx: index('chunks_scope_idx').on(table.scope),
  // Index for parent-child relationships (small-to-big retrieval)
  parentIdx: index('chunks_parent_idx').on(table.parentId),
}));

// Chunk links table - internal references between chunks
export const chunkLinks = pgTable('chunk_links', {
  fromChunkId: text('from_chunk_id').notNull().references(() => chunks.chunkId),
  toSection: text('to_section').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.fromChunkId, table.toSection] }),
}));
