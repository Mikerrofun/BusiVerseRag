import { EvalMetrics } from './runner.types';
import { EVAL_CONFIG } from '../eval.config';

/**
 * Метрики одного вопроса: прямое сравнение множеств частей.
 *
 * Expected содержит все части expected-блоков (questions.jsonl размечен на уровне
 * блоков), retrieved — все части групп после expand. Поэтому части того же блока,
 * что и expected, больше не считаются FP — сравнение честное без разбора структуры id.
 */
export function calculateMetrics(
  qid: string,
  question: string,
  difficulty: string,
  unanswerable: boolean,
  expected: string[],
  retrieved: string[],
  retrievedOrdered: string[],
): EvalMetrics {
  const expectedSet = new Set(expected);
  const retrievedSet = new Set(retrieved);

  const matched = Array.from(expectedSet).filter((id) => retrievedSet.has(id)).length;

  const recall = expectedSet.size > 0 ? matched / expectedSet.size : 0;
  const precision = retrievedSet.size > 0 ? matched / retrievedSet.size : 0;
  const hit = recall > 0;

  const firstMatchIndex = retrievedOrdered.findIndex((id) => expectedSet.has(id));
  const mrr = firstMatchIndex >= 0 ? 1 / (firstMatchIndex + 1) : 0;

  return {
    qid,
    question,
    difficulty,
    unanswerable,
    recall,
    hit,
    precision,
    mrr,
    expected_count: expectedSet.size,
    retrieved_count: retrievedSet.size,
    matched_count: matched,
    perfect_match: recall >= EVAL_CONFIG.PERFECT_THRESHOLD,
  };
}
