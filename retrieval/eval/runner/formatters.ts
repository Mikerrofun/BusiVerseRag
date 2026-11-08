import { AggregatedMetrics, GroupStats } from './runner.types';

export function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function printGroupStats(label: string, stats: GroupStats): void {
  console.log(
    `  ${label.padEnd(10)} (n=${stats.count}): ` +
    `R=${pct(stats.avg_recall)}, P=${pct(stats.avg_precision)}, ` +
    `MRR=${stats.avg_mrr.toFixed(3)}, hit=${pct(stats.hit_rate)}, ` +
    `perfect=${stats.perfect_matches}`
  );
}

export function printAggregatedMetrics(agg: AggregatedMetrics): void {
  console.log('\n' + '='.repeat(80));
  console.log('📈 AGGREGATED METRICS');
  console.log('='.repeat(80));

  console.log(`\nTotal questions: ${agg.total_questions} (evaluated: ${agg.evaluated_questions})`);
  console.log(
    `Unanswerable: ${agg.unanswerable.total} было, ${agg.unanswerable.processed} обработано ` +
    `(исключены из средних)`
  );
  console.log(`Hit rate: ${pct(agg.hit_rate)}`);
  console.log(`Perfect matches: ${agg.perfect_matches} (${pct(agg.perfect_matches / agg.evaluated_questions)})`);
  console.log(`\nAverage Recall:    ${pct(agg.avg_recall)}`);
  console.log(`Average Precision: ${pct(agg.avg_precision)}`);
  console.log(`Average MRR:       ${agg.avg_mrr.toFixed(3)}`);

  console.log('\n' + '-'.repeat(80));
  console.log('By Difficulty:');
  for (const [difficulty, stats] of Object.entries(agg.by_difficulty)) {
    printGroupStats(difficulty, stats);
  }

  console.log('\n' + '-'.repeat(80));
  console.log('By Group:');
  for (const [group, stats] of Object.entries(agg.by_group)) {
    printGroupStats(group, stats);
  }

  console.log('\n' + '='.repeat(80));
}
