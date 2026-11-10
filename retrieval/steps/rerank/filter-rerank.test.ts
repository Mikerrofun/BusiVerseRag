import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { filterRerank } from './filter-rerank';
import type { ScoredChunk } from '../../types/retrieval.types';

function scored(score: number): ScoredChunk {
  return { chunk: {} as ScoredChunk['chunk'], score };
}

test('пустой вход возвращает пустой массив', () => {
  assert.deepEqual(filterRerank([]), []);
});

test('отсекает все результаты, если лучший score ниже maxThreshold', () => {
  assert.deepEqual(filterRerank([scored(0.29), scored(0.2)]), []);
});

test('оставляет все результаты, прошедшие individualThreshold', () => {
  const items = [scored(0.8), scored(0.3), scored(0.25)];
  assert.deepEqual(filterRerank(items), items);
});

test('удаляет слабые результаты, если max score прошёл гейт', () => {
  const strong = scored(0.31);
  const weak = scored(0.24);
  assert.deepEqual(filterRerank([strong, weak]), [strong]);
});
