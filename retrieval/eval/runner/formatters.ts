import { AggregatedMetrics } from './runner.types';

export function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function printAggregatedMetrics(agg: AggregatedMetrics): void {
  console.log('\n' + '='.repeat(80));
  console.log('📈 AGGREGATED METRICS');
  console.log('='.repeat(80));
  
  console.log(`\nTotal questions: ${agg.total_questions}`);
  console.log(`Perfect matches: ${agg.perfect_matches} (${pct(agg.perfect_matches / agg.total_questions)})`);
  console.log(`\nAverage Precision: ${pct(agg.avg_precision)}`);
  console.log(`Average Recall:    ${pct(agg.avg_recall)}`);
  console.log(`Average F1:        ${pct(agg.avg_f1)}`);
  
  console.log('\n' + '-'.repeat(80));
  console.log('By Difficulty:');
  for (const [difficulty, stats] of Object.entries(agg.by_difficulty)) {
    console.log(
      `  ${difficulty.padEnd(10)} (n=${stats.count}): ` +
      `P=${pct(stats.avg_precision)}, R=${pct(stats.avg_recall)}, F1=${pct(stats.avg_f1)}, ` +
      `perfect=${stats.perfect_matches}`
    );
  }
  
  console.log('\n' + '-'.repeat(80));
  console.log('By Group:');
  for (const [group, stats] of Object.entries(agg.by_group)) {
    console.log(
      `  ${group.padEnd(10)} (n=${stats.count}): ` +
      `P=${pct(stats.avg_precision)}, R=${pct(stats.avg_recall)}, F1=${pct(stats.avg_f1)}, ` +
      `perfect=${stats.perfect_matches}`
    );
  }
  
  console.log('\n' + '='.repeat(80));
}
