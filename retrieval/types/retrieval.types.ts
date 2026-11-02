// Типы retrieval-системы (план 06, раздел 4). Все типы системы живут только здесь.

// Коды ниш = значения business_type в БД (план 01, раздел 2.2)
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
  /** Код ниши из селектора UI. Если передана — классификатор не вызывается. */
  niche?: NicheCode;
}

/** Способ определения ниши: ui / fulltext-probe / llm / none */
export type NicheSource = 'ui' | 'fulltext-probe' | 'llm' | 'none';

export interface NicheDecision {
  niche: NicheCode | null;
  source: NicheSource;
  confidence: number | null;
}

/** Строка chunks из БД, нужная конвейеру (DDL: db/migrations/0000_initial_schema.sql) */
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

/** Роль чанка в контексте: основной хит / кусок блока / родитель-секция / ссылка */
export type ChunkRole = 'hit' | 'part' | 'parent' | 'link';

/** Чанк в итоговой выдаче — контракт раздела 4 */
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
  /** Контекст обрезан по токен-бюджету */
  truncated: boolean;
}

export interface RetrievalResult {
  context: string;
  chunks: ContextChunk[];
  meta: RetrievalMeta;
}

/** Ответ LLM-классификатора (строго JSON) */
export interface ClassifierAnswer {
  niche: string;
  confidence: number;
}

// --- Форматы внешних API ---

export interface JinaEmbeddingData {
  index: number;
  embedding: number[];
}

export interface JinaEmbeddingResponse {
  data: JinaEmbeddingData[];
}

export interface JinaRerankResult {
  index: number;
  relevance_score: number;
}

export interface JinaRerankResponse {
  results: JinaRerankResult[];
}

export interface ZaiChatChoice {
  message?: { content?: string | null };
}

export interface ZaiChatResponse {
  choices?: ZaiChatChoice[];
}

// --- Внутренние типы шагов конвейера ---

/** Единица контекста после small-to-big: блок целиком / родитель-секция / ссылка */
export interface ContextUnit {
  kind: 'block' | 'parent' | 'link';
  /** Готовый текст единицы: для блока — куски, склеенные по порядку */
  text: string;
  /** heading_path единицы для заголовка-источника */
  heading: string;
  /** Лучший rerank-скор хита, приведшего к единице */
  score: number;
  /** Все чанки, вошедшие в единицу (куски блока либо один чанк) */
  parts: ChunkRow[];
}

/** Группа контекста: блок хита + его родитель + его ссылки */
export interface ExpandedGroup {
  /** Ключ блока: parent_id + chunk_index — для дедупа хитов одного блока */
  key: string;
  /** Лучший rerank-скор хитов группы */
  score: number;
  block: ContextUnit;
  parent: ContextUnit | null;
  links: ContextUnit[];
  /** Хиты, попавшие в этот блок */
  hits: ScoredChunk[];
}
