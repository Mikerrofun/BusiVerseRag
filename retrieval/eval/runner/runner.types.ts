import { NicheCode } from '../../types/retrieval.types';

/** Структура одной строки из questions.jsonl */
export interface EvalQuestion {
  qid: string;
  group: string;
  business_type: NicheCode | null;
  question: string;
  question_style: string;
  content_type: string;
  expected_chunk_ids: string[];
  expected_section: string | null;
  expected_sections: string[];
  difficulty: string;
  notes: string;
}

/** Результат оценки одного вопроса (сравнение множеств частей, без разбора структуры id) */
export interface EvalMetrics {
  qid: string;
  question: string;
  difficulty: string;
  /** |expected ∩ retrieved| / |expected| — доля expected-частей, которые нашлись */
  recall: number;
  /** Найдена хотя бы одна expected-часть (recall > 0) */
  hit: boolean;
  /** |expected ∩ retrieved| / |retrieved| — доля правильных среди найденных */
  precision: number;
  /** 1/позиция первой expected-части в упорядоченном retrieved; 0, если не найдена */
  mrr: number;
  expected_count: number;
  retrieved_count: number;
  /** |expected ∩ retrieved| */
  matched_count: number;
  /** recall >= PERFECT_THRESHOLD из eval.config */
  perfect_match: boolean;
}

/** Статистика по группе (difficulty или group) */
export interface GroupStats {
  count: number;
  avg_recall: number;
  avg_precision: number;
  avg_mrr: number;
  hit_rate: number;
  perfect_matches: number;
}

/** Агрегированные метрики по всем вопросам */
export interface AggregatedMetrics {
  total_questions: number;
  /** Доля вопросов с hit (recall > 0) */
  hit_rate: number;
  perfect_matches: number;
  avg_recall: number;
  avg_precision: number;
  avg_mrr: number;
  /** Группировка по сложности (easy, medium, hard) */
  by_difficulty: Record<string, GroupStats>;
  /** Группировка по типу (niche, hard) */
  by_group: Record<string, GroupStats>;
}

export interface RunEvalOptions {
  questionsPath?: string;
  limit?: number;
  skip?: number;
  outputJson?: boolean;
}

export interface QuestionResult<T = any> {
  question: EvalQuestion;
  result: T;
  metrics: EvalMetrics;
}
