import {
  AggregatedMetrics,
  EvalMetrics,
  GroupStats,
  QuestionResult,
} from './runner.types';

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function calculateGroupStats(metrics: EvalMetrics[]): GroupStats {
  return {
    count: metrics.length,
    avg_recall: avg(metrics.map((m) => m.recall)),
    avg_precision: avg(metrics.map((m) => m.precision)),
    avg_mrr: avg(metrics.map((m) => m.mrr)),
    hit_rate: metrics.length > 0 ? metrics.filter((m) => m.hit).length / metrics.length : 0,
    perfect_matches: metrics.filter((m) => m.perfect_match).length,
  };
}

export function aggregateMetrics(results: QuestionResult[]): AggregatedMetrics {
  // Unanswerable-вопросы считаются per-question, но исключаются из всех агрегатов
  const answerable = results.filter((r) => !r.question.unanswerable);
  const unanswerable = results.filter((r) => r.question.unanswerable);

  const byDifficulty: Record<string, EvalMetrics[]> = {};
  const byGroup: Record<string, EvalMetrics[]> = {};

  for (const { question, metrics } of results.filter((r) => !r.question.unanswerable)) {
    if (!byDifficulty[question.difficulty]) {
      byDifficulty[question.difficulty] = [];
    }
    byDifficulty[question.difficulty].push(metrics);

    if (!byGroup[question.group]) {
      byGroup[question.group] = [];
    }
    byGroup[question.group].push(metrics);
  }

  const allMetrics = answerable.map((r) => r.metrics);

  return {
    total_questions: results.length,
    evaluated_questions: answerable.length,
    unanswerable: {
      total: results.length - answerable.length,
      processed: unanswerable.length,
    },
    hit_rate: allMetrics.length > 0 ? allMetrics.filter((m) => m.hit).length / allMetrics.length : 0,
    perfect_matches: allMetrics.filter((m) => m.perfect_match).length,
    avg_recall: avg(allMetrics.map((m) => m.recall)),
    avg_precision: avg(allMetrics.map((m) => m.precision)),
    avg_mrr: avg(allMetrics.map((m) => m.mrr)),

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
