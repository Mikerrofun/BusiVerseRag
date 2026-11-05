import { EvalMetrics } from './runner.types';

/**
 * Вычисляет метрики качества поиска для одного вопроса
 * 
 * Сравниваем retrieved (только block.parts) с expected (из questions.jsonl)
 * 
 * Пример:
 * expected = ['chunk1', 'chunk2', 'chunk3']     // правильные чанки из questions.jsonl
 * retrieved = ['chunk1', 'chunk2', 'chunk4']    // block.parts из expandHits (БЕЗ parent/links)
 * 
 * True Positives (TP) = 2     → chunk1, chunk2 (нашли и они правильные) ✓
 * False Positives (FP) = 1    → chunk4 (нашли, но он лишний) ✗
 * False Negatives (FN) = 1    → chunk3 (не нашли, хотя надо было) ✗
 * 
 * Precision = 2/3 = 66.7%     → из 3 найденных, 2 правильные
 * Recall = 2/3 = 66.7%        → из 3 нужных, 2 нашли
 * F1 = 66.7%                  → баланс между precision и recall
 */

export function calculateMetrics(
  qid: string,
  question: string,
  difficulty: string,
  expected: string[],    
  retrieved: string[]
): EvalMetrics {
  const expectedSet = new Set(expected);
  
  let truePositives = 0;  
  let falsePositives = 0;
  

  for (const chunkId of retrieved) {
    if (expectedSet.has(chunkId)) {
      truePositives++;   
    } else {
      falsePositives++;  
    }
  }
  
  const falseNegatives = expected.length - truePositives;
  
  const precision = retrieved.length > 0 ? truePositives / retrieved.length : 0;
  
  const recall = expected.length > 0 ? truePositives / expected.length : 0;
  
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  
  const perfectMatch = truePositives === expected.length && falsePositives === 0;
  
  return {
    qid,
    question,
    difficulty,
    precision,
    recall,
    f1,
    true_positives: truePositives,
    false_positives: falsePositives,
    false_negatives: falseNegatives,
    expected_count: expected.length,
    retrieved_count: retrieved.length,
    perfect_match: perfectMatch,
  };
}
