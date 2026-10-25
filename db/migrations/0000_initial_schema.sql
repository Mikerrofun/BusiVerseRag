-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create sources table
CREATE TABLE IF NOT EXISTS sources (
  source_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  doc_version TEXT NOT NULL,
  valid_from DATE NOT NULL,
  content_hash TEXT NOT NULL
);

-- Create chunks table
CREATE TABLE IF NOT EXISTS chunks (
  chunk_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(source_id),
  business_type TEXT NOT NULL,
  block TEXT NOT NULL,
  section_code TEXT,
  section_title TEXT,
  block_title TEXT,
  heading_path TEXT[] NOT NULL DEFAULT '{}',
  chunk_type TEXT NOT NULL,
  topics TEXT[] NOT NULL DEFAULT '{}',
  scope TEXT NOT NULL DEFAULT 'business',
  parent_id TEXT,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  line_start INTEGER,
  line_end INTEGER,
  token_count INTEGER NOT NULL,
  text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('russian', text)) STORED,
  embedding VECTOR(1024)
);

-- Create indexes for chunks table
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS chunks_filter_idx ON chunks (business_type, section_code);
CREATE INDEX IF NOT EXISTS chunks_scope_idx ON chunks (scope);
CREATE INDEX IF NOT EXISTS chunks_parent_idx ON chunks (parent_id);

-- Create chunk_links table
CREATE TABLE IF NOT EXISTS chunk_links (
  from_chunk_id TEXT NOT NULL REFERENCES chunks(chunk_id),
  to_section TEXT NOT NULL,
  PRIMARY KEY (from_chunk_id, to_section)
);

-- Add comments for documentation
COMMENT ON TABLE sources IS 'Source documents that are chunked for RAG system';
COMMENT ON TABLE chunks IS 'Individual content chunks with embeddings for vector search';
COMMENT ON TABLE chunk_links IS 'Internal references between chunks (e.g., "see section B0")';

COMMENT ON COLUMN chunks.business_type IS 'Business niche: coffee_shop, pickup_point, mini_bakery, etc.';
COMMENT ON COLUMN chunks.block IS 'offline or online or global';
COMMENT ON COLUMN chunks.scope IS 'global (applies to all niches) or business (niche-specific)';
COMMENT ON COLUMN chunks.chunk_type IS 'case, sop, table, checklist, or prose';
COMMENT ON COLUMN chunks.heading_path IS 'Hierarchical path: ["1. ОФЛАЙН — КОФЕЙНЯ", "1.3. Финансовая модель", ...]';
COMMENT ON COLUMN chunks.embedding IS 'Vector embedding (1024 dimensions) for semantic search';
COMMENT ON COLUMN chunks.tsv IS 'Full-text search vector (russian configuration)';
