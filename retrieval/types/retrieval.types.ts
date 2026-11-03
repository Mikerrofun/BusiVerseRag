// Контракт retrieval-системы (план 06, раздел 4) и общие структуры данных.

export type NicheCode =
  | 'coffee_shop'
  | 'pickup_point'
  | 'mini_bakery'
  | 'manicure_studio'
  | 'auto_service'
  | 'marketplace_seller'
  | 'online_school'
  | 'smm_agency'
  | 'own_online_store'
  | 'remote_accounting';

export interface RetrieveInput {
  query: string;
  /** Код ниши из селектора UI — классификатор при этом не вызывается */
  niche?: NicheCode;
}

export type NicheSource = 'ui' | 'fulltext-probe' | 'llm' | 'none';

/** Строка chunks из БД (DDL: db/migrations/0000_initial_schema.sql) */
export interface ChunkRow {
  chunk_id: string;
  business_type: string;
  block: string;
  section_code: string | null;
  section_title: string | null;
  block_title: string | null;
  heading_path: string[];
  chunk_type: string;
  scope: string;
  parent_id: string | null;
  /** Номер блока внутри секции; у кусков одного блока совпадает */
  chunk_index: number;
  line_start: number | null;
  token_count: number;
  text: string;
}

/** Чанк со скором этапа (vector / FTS / RRF / rerank — шкала зависит от этапа) */
export interface ScoredChunk {
  chunk: ChunkRow;
  score: number;
}

export type ChunkRole = 'hit' | 'part' | 'parent' | 'link';

export interface ContextChunk {
  chunk_id: string;
  heading_path: string[];
  section_title: string | null;
  block_title: string | null;
  chunk_type: string;
  score: number;
  role: ChunkRole;
}

export interface RetrievalCounters {
  vector: number;
  fts: number;
  rrf: number;
  rerank: number;
  context: number;
}

export interface RetrievalMeta {
  niche: NicheCode | null;
  niche_source: NicheSource;
  confidence: number | null;
  counters: RetrievalCounters;
  truncated: boolean;
}

export interface RetrievalResult {
  context: string;
  chunks: ContextChunk[];
  meta: RetrievalMeta;
}
