import * as fs from 'fs';
import * as path from 'path';
import { evalRetrieve } from '../evalFunction/eval';
import { EvalRetrievalResult } from '../evalFunction/eval.types';
import { NicheCode } from '../../types/retrieval.types';
import { calculateMetrics } from './metrics';
import { aggregateMetrics } from './aggregation';
import { loadQuestions } from './loaders';
import { printAggregatedMetrics, pct } from './formatters';
import { RunEvalOptions, QuestionResult } from './runner.types';

export async function runEval(options: RunEvalOptions): Promise<void> {
  const questionsPath = options.questionsPath ?? path.join(__dirname, '..', 'questions.jsonl');
  const { limit, outputJson = false } = options;
  
  console.log('🚀 Starting eval runner...');
  console.log(`📁 Loading questions from: ${questionsPath}\n`);
  
  let questions = loadQuestions(questionsPath);
  
  if (limit) {
    console.log(`⚠️  Limiting to first ${limit} questions\n`);
    questions = questions.slice(0, limit);
  }
  
  console.log(`📊 Total questions to process: ${questions.length}\n`);
  
  const results: QuestionResult<EvalRetrievalResult>[] = [];
  
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`\n[${i + 1}/${questions.length}] Processing: ${q.qid}`);
    
    try {
      const result = await evalRetrieve({
        query: q.question,
        niche: q.business_type as NicheCode | undefined,
        expected_chunk_ids: q.expected_chunk_ids,
        expected_section: q.expected_section,
        expected_sections: q.expected_sections,
      });
      
      const metrics = calculateMetrics(
        q.qid,
        q.question,
        q.difficulty,
        q.expected_chunk_ids,
        result.retrieved_chunk_ids
      );
      
      results.push({ question: q, result, metrics });
      
      console.log(
        `   ✓ P=${pct(metrics.precision)} R=${pct(metrics.recall)} F1=${pct(metrics.f1)} ` +
        `${metrics.perfect_match ? '🎯' : ''}`
      );
      
    } catch (error) {
      console.error(`   ✗ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  const agg = aggregateMetrics(results);
  printAggregatedMetrics(agg);
  
  if (outputJson) {
    const outputPath = path.join(__dirname, '..', 'eval-results.json');
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          aggregated: agg,
          results: results.map(r => ({
            qid: r.question.qid,
            question: r.question.question,
            metrics: r.metrics,
            retrieved_chunk_ids: r.result.retrieved_chunk_ids,
            expected_chunk_ids: r.question.expected_chunk_ids,
          })),
        },
        null,
        2
      )
    );
    console.log(`\n💾 Results saved to: ${outputPath}`);
  }
  
  console.log('\n✅ Eval complete!\n');
}

if (require.main === module) {
  const limit = process.argv.includes('--limit')
    ? parseInt(process.argv[process.argv.indexOf('--limit') + 1], 10)
    : undefined;
  
  const outputJson = process.argv.includes('--json');
  
  runEval({ limit, outputJson }).catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}
