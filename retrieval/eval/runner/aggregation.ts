import { 
  AggregatedMetrics, 
  EvalMetrics, 
  DifficultyStats,
  GroupStats,
  QuestionResult
} from './runner.types';

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function calculateGroupStats(metrics: EvalMetrics[]): DifficultyStats | GroupStats {
  return {
    count: metrics.length,
    avg_precision: avg(metrics.map(m => m.precision)),
    avg_recall: avg(metrics.map(m => m.recall)),
    avg_f1: avg(metrics.map(m => m.f1)),
    perfect_matches: metrics.filter(m => m.perfect_match).length,
  };
}

export function aggregateMetrics(results: QuestionResult[]): AggregatedMetrics {
  const byDifficulty: Record<string, EvalMetrics[]> = {};
  const byGroup: Record<string, EvalMetrics[]> = {};
  
  for (const { question, metrics } of results) {
    if (!byDifficulty[question.difficulty]) {
      byDifficulty[question.difficulty] = [];
    }
    byDifficulty[question.difficulty].push(metrics);
    
    if (!byGroup[question.group]) {
      byGroup[question.group] = [];
    }
    byGroup[question.group].push(metrics);
  }
  
  const allMetrics = results.map(r => r.metrics);
  const perfectMatches = allMetrics.filter(m => m.perfect_match).length;
  
  return {
    total_questions: results.length,
    perfect_matches: perfectMatches,
    avg_precision: avg(allMetrics.map(m => m.precision)),
    avg_recall: avg(allMetrics.map(m => m.recall)),
    avg_f1: avg(allMetrics.map(m => m.f1)),
    
    by_difficulty: Object.fromEntries(
      Object.entries(byDifficulty).map(([difficulty, metrics]) => [
        difficulty,
        calculateGroupStats(metrics),
      ])
    ),
    
    by_group: Object.fromEntries(
      Object.entries(byGroup).map(([group, metrics]) => [
        group,
        calculateGroupStats(metrics),
      ])
    ),
  };
}
