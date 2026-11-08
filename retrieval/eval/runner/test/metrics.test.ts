// Тесты новой системы метрик (план evalImprove, задача 3): чистые функции
// на маленьких фикстурах, без тестовых фреймворков — встроенный раннер node:test.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateMetrics } from '../metrics';
import { aggregateMetrics } from '../aggregation';
import { EVAL_CONFIG } from '../../eval.config';
import { QuestionResult } from '../runner.types';

function metrics(
  expected: string[],
  retrieved: string[],
  retrievedOrdered: string[] = retrieved,
) {
  return calculateMetrics('q-test', 'Тестовый вопрос', 'easy', expected, retrieved, retrievedOrdered);
}

test('полное попадание: recall=1, perfect_match, mrr=1', () => {
  const m = metrics(['a', 'b'], ['a', 'b', 'c']);
  assert.equal(m.recall, 1);
  assert.equal(m.precision, 2 / 3);
  assert.equal(m.hit, true);
  assert.equal(m.mrr, 1);
  assert.equal(m.perfect_match, true);
  assert.equal(m.matched_count, 2);
  assert.equal(m.expected_count, 2);
  assert.equal(m.retrieved_count, 3);
});

test('частичное попадание: recall < порога — не perfect', () => {
  const m = metrics(['a', 'b', 'c'], ['a', 'd']);
  assert.equal(m.recall, 1 / 3);
  assert.equal(m.precision, 1 / 2);
  assert.equal(m.hit, true);
  assert.equal(m.perfect_match, false);
});

test('промах: recall=0, precision=0, hit=false, mrr=0', () => {
  const m = metrics(['a'], ['x', 'y']);
  assert.equal(m.recall, 0);
  assert.equal(m.precision, 0);
  assert.equal(m.hit, false);
  assert.equal(m.mrr, 0);
  assert.equal(m.perfect_match, false);
});

test('mrr считается по позиции первого expected в упорядоченном retrieved', () => {
  const m = metrics(['b'], ['x', 'b', 'y'], ['x', 'b', 'y']);
  assert.equal(m.mrr, 1 / 2);
  // порядок не влияет на recall/precision
  assert.equal(m.recall, 1);
  assert.equal(m.precision, 1 / 3);
});

test('дубликаты в retrieved не завышают precision (сравнение множеств)', () => {
  const m = metrics(['a'], ['a', 'a', 'b']);
  assert.equal(m.matched_count, 1);
  assert.equal(m.retrieved_count, 2);
  assert.equal(m.precision, 1 / 2);
});

test('пустой expected: все метрики нулевые, не perfect', () => {
  const m = metrics([], ['x', 'y']);
  assert.equal(m.recall, 0);
  assert.equal(m.precision, 0);
  assert.equal(m.hit, false);
  assert.equal(m.mrr, 0);
  assert.equal(m.perfect_match, false);
});

test('perfect_match срабатывает на границе порога (recall >= PERFECT_THRESHOLD)', () => {
  assert.equal(EVAL_CONFIG.PERFECT_THRESHOLD, 0.9);
  // 9 из 10 = ровно 0.9
  const expected = Array.from({ length: 10 }, (_, i) => `e${i}`);
  const retrieved = expected.slice(0, 9);
  const m = metrics(expected, retrieved);
  assert.equal(m.recall, 0.9);
  assert.equal(m.perfect_match, true);
});

test('порядок retrievedOrdered не совпадает с retrieved — mrr по упорядоченному', () => {
  const m = metrics(['a', 'b'], ['a', 'b'], ['b', 'a']);
  assert.equal(m.mrr, 1);
  const m2 = metrics(['a', 'b'], ['a', 'b'], ['x', 'b', 'a']);
  assert.equal(m2.mrr, 1 / 2);
});

// --- aggregateMetrics ---

function fakeResult(qid: string, group: string, difficulty: string, recall: number): QuestionResult {
  return {
    question: {
      qid,
      group,
      business_type: null,
      question: qid,
      question_style: 'colloquial',
      content_type: 'table',
      expected_chunk_ids: [],
      expected_section: null,
      expected_sections: [],
      difficulty,
      notes: '',
    },
    result: {},
    metrics: {
      qid,
      question: qid,
      difficulty,
      recall,
      hit: recall > 0,
      precision: recall,
      mrr: recall,
      expected_count: 1,
      retrieved_count: 1,
      matched_count: recall,
      perfect_match: recall >= EVAL_CONFIG.PERFECT_THRESHOLD,
    },
  };
}

test('агрегация: средние по всем вопросам и разрезы by_difficulty / by_group', () => {
  const results: QuestionResult[] = [
    fakeResult('q1', 'niche', 'easy', 1),
    fakeResult('q2', 'niche', 'easy', 0),
    fakeResult('q3', 'hard', 'hard', 0.5),
  ];
  const agg = aggregateMetrics(results);
  assert.equal(agg.total_questions, 3);
  assert.equal(agg.avg_recall, (1 + 0 + 0.5) / 3);
  assert.equal(agg.hit_rate, 2 / 3);
  assert.equal(agg.perfect_matches, 1);
  assert.equal(agg.by_difficulty.easy.count, 2);
  assert.equal(agg.by_difficulty.easy.avg_recall, 0.5);
  assert.equal(agg.by_difficulty.easy.hit_rate, 0.5);
  assert.equal(agg.by_difficulty.hard.count, 1);
  assert.equal(agg.by_group.niche.count, 2);
  assert.equal(agg.by_group.hard.count, 1);
});

test('агрегация на пустом списке не падает и даёт нули', () => {
  const agg = aggregateMetrics([]);
  assert.equal(agg.total_questions, 0);
  assert.equal(agg.avg_recall, 0);
  assert.equal(agg.hit_rate, 0);
  assert.deepEqual(agg.by_difficulty, {});
  assert.deepEqual(agg.by_group, {});
});
