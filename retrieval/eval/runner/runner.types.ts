/** Структура одной строки из questions.jsonl */
export interface EvalQuestion {
  qid: string;
  group: string;
  business_type: string | null;
  question: string;
  question_style: string;
  content_type: string;
  expected_chunk_ids: string[];
  expected_section: string | null;
  expected_sections: string[];
  difficulty: string;
  unanswerable: boolean;
  notes: string;
}

/** Результат оценки одного вопроса */
export interface EvalMetrics {
  qid: string;
  question: string;
  difficulty: string;
  /** TP / (TP + FP) — доля правильных среди найденных */
  precision: number;
  /** TP / (TP + FN) — доля найденных среди правильных */
  recall: number;
  /** Гармоническое среднее precision и recall */
  f1: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  expected_count: number;
  retrieved_count: number;
  /** Все expected найдены, лишних нет */
  perfect_match: boolean;
}

/** Агрегированные метрики по всем вопросам */
export interface AggregatedMetrics {
  total_questions: number;
  perfect_matches: number;
  avg_precision: number;
  avg_recall: number;
  avg_f1: number;
  /** Группировка по сложности (easy, medium, hard) */
  by_difficulty: Record<string, DifficultyStats>;
  /** Группировка по типу (niche, global, hard) */
  by_group: Record<string, GroupStats>;
}

export interface DifficultyStats {
  count: number;
  avg_precision: number;
  avg_recall: number;
  avg_f1: number;
  perfect_matches: number;
}

export interface GroupStats {
  count: number;
  avg_precision: number;
  avg_recall: number;
  avg_f1: number;
  perfect_matches: number;
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
