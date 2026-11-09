import { NicheCode } from '../../types/retrieval.types';

/** Входные данные для eval-retrieval */
export interface EvalRetrieveInput {
  query: string;
  /** Ниша: валидный NicheCode или null («ниша неизвестна»). undefined в системе не существует */
  niche: NicheCode | null;
  /** Ожидаемые chunk_id для сравнения с результатами retrieval */
  expected_chunk_ids?: string[];
  expected_section?: string | null;
  expected_sections?: string[];
}

/** Счётчики этапов pipeline для отладки */
export interface EvalCounters {
  vector: number;
  fts: number;
  rrf: number;
  rerank: number;
  expanded_groups: number;
  total_chunks: number;
}

/** Результат eval-retrieval: только chunk IDs для сравнения с expected */
export interface EvalRetrievalResult {
  query: string;
  /** Все chunk_id, извлечённые из expandHits (только block.parts, БЕЗ parent и links) */
  retrieved_chunk_ids: string[];
  /** Те же chunk_id в порядке rerank: от лучшего хита к худшему, без дубликатов */
  retrieved_chunk_ids_ordered: string[];
  /** Rerank-скор первой группы (лучший хит прогонa); null, если ничего не найдено */
  top_rerank_score: number | null;
  expected_chunk_ids: string[];
  expected_section: string | null;
  expected_sections: string[];
  niche: NicheCode | null;
  /** Источник определения ниши: ui → fulltext-probe → llm → none */
  niche_source: 'ui' | 'fulltext-probe' | 'llm' | 'none';
  confidence: number | null;
  counters: EvalCounters;
}
