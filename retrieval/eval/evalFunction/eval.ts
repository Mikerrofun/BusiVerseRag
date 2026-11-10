/**
 * Eval-режим retrieval: выполняет полный pipeline (шаги 1-8)
 * Возвращает только chunk IDs вместо полного контекста для оценки качества поиска
 */

import { isNicheCode } from '../../config/niches.config';
import { detectNiche } from '../../steps/classification/classify';
import { embedQuery } from '../../steps/embedding/embed-query';
import { SEARCH_CONFIG } from '../../steps/search/search.config';
import { vectorSearch } from '../../steps/search/vector-search';
import { ftsSearch } from '../../steps/search/fts';
import { fuseRrf } from '../../steps/fusion/rrf';
import { rerank } from '../../steps/rerank/rerank';
import { filterRerank } from '../../steps/rerank/filter-rerank';
import { expandHits } from '../../steps/expand/expand';
import { EvalRetrieveInput, EvalRetrievalResult } from './eval.types';

/** 
 * Извлекает уникальные chunk_id ТОЛЬКО из block.parts
 * 
 * НЕ включаем parent и links, потому что:
 * - Expected в questions.jsonl содержит только листовые блоки
 * - Parent и links — это "необходимый шум" для LLM, но не часть golden standard для поиска
 * - Eval должен измерять точность попадания в ключевые блоки, а не архитектуру контекста
 * 
 * Используем Set для автоматического удаления дубликатов на случай, если один chunk
 * встретится в parts нескольких групп (хотя в текущей реализации expand это маловероятно).
 */
function extractChunkIds(groups: Awaited<ReturnType<typeof expandHits>>): string[] {
  const ids = new Set<string>();
  
  for (const group of groups) {
    for (const part of group.block.parts) {
      ids.add(part.chunk_id);
    }
    
  }
  
  return Array.from(ids);
}

/**
 * Собирает retrieved-части в порядке rerank: от лучшего хита к худшему.
 *
 * expandHits возвращает группы в порядке первых вхождений хитов после rerank
 * (Map сохраняет порядок вставки — группа создаётся при первом хите блока),
 * поэтому итерация по группам сверху вниз и есть порядок rerank.
 * Часть может появиться в нескольких группах — берём первое вхождение.
 */
function extractOrderedChunkIds(groups: Awaited<ReturnType<typeof expandHits>>): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const part of group.block.parts) {
      if (!seen.has(part.chunk_id)) {
        seen.add(part.chunk_id);
        ordered.push(part.chunk_id);
      }
    }
  }

  return ordered;
}

export async function evalRetrieve(input: EvalRetrieveInput): Promise<EvalRetrievalResult> {
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) throw new Error('query: обязательна непустая строка');
  // null — легитимное значение («ниша неизвестна»), классификатор определит её сам
  if (input.niche !== null && !isNicheCode(input.niche)) {
    throw new Error(`niche: неизвестный код «${String(input.niche)}»`);
  }

  const decision = await detectNiche(query, input.niche);
  const vector = await embedQuery(query);

  const [vectorHits, ftsHits] = await Promise.all([
    vectorSearch(vector, decision.niche, SEARCH_CONFIG.topK),
    ftsSearch(query, decision.niche, SEARCH_CONFIG.topK),
  ]);

  const fused = fuseRrf([vectorHits, ftsHits]);
  const top = await rerank(query, fused);
  const filtered = filterRerank(top);
  const groups = await expandHits(filtered);

  const retrievedChunkIds = extractChunkIds(groups);
  const retrievedChunkIdsOrdered = extractOrderedChunkIds(groups);
  const topRerankScore = top.length > 0 ? top[0].score : null;
  const expectedChunkIds = input.expected_chunk_ids ?? [];
  const expectedSection = input.expected_section ?? null;
  const expectedSections = input.expected_sections ?? [];

  const result: EvalRetrievalResult = {
    query,
    retrieved_chunk_ids: retrievedChunkIds,
    retrieved_chunk_ids_ordered: retrievedChunkIdsOrdered,
    top_rerank_score: topRerankScore,
    expected_chunk_ids: expectedChunkIds,
    expected_section: expectedSection,
    expected_sections: expectedSections,
    niche: decision.niche,
    niche_source: decision.source,
    confidence: decision.confidence,
    counters: {
      vector: vectorHits.length,
      fts: ftsHits.length,
      rrf: fused.length,
      rerank: top.length,
      filtered: filtered.length,
      expanded_groups: groups.length,
      total_chunks: retrievedChunkIds.length,
    },
  };

  console.log('\n' + '='.repeat(80));
  console.log('📊 EVAL RETRIEVAL RESULT');
  console.log('='.repeat(80));
  console.log(`Query: "${query}"`);
  console.log(`Niche: ${decision.niche ?? 'none'} (source: ${decision.source})`);
  console.log('-'.repeat(80));
  console.log(`✅ Expected chunks (${expectedChunkIds.length}):`);
  console.log(expectedChunkIds.length > 0 ? expectedChunkIds.join(', ') : '  (none)');
  console.log(`🔍 Retrieved chunks (${retrievedChunkIds.length}):`);
  console.log(retrievedChunkIds.length > 0 ? retrievedChunkIds.join(', ') : '  (none)');
  console.log('-'.repeat(80));
  console.log(`Expected sections: ${expectedSections.join(', ') || '(none)'}`);
  console.log(`Counters: vector=${vectorHits.length}, fts=${ftsHits.length}, rrf=${fused.length}, rerank=${top.length}, filtered=${filtered.length}, groups=${groups.length}`);
  console.log('='.repeat(80) + '\n');

  return result;
}

export type { EvalRetrieveInput, EvalRetrievalResult } from './eval.types';
