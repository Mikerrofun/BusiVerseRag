// Минимальные тесты (план 3, раздел 13): чистые функции на маленьких фикстурах,
// без чтения реального файла и без тестовых фреймворков — встроенный раннер node:test.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { classifyHead } from '../lib/classify';
import { splitBlock } from '../lib/split';
import { parseDocument } from '../lib/parse';
import { buildChunks, blockChunkId, parentChunkId, partChunkId } from '../lib/emit';
import { extractLinks } from '../lib/links';
import { CONFIG } from '../config/chunking.config';
import { InternalChunk, ParsedBlock } from '../types/chunking.types';

// фейковый счётчик: 1 символ = 1 «токен» — бюджет легко контролировать в фикстурах
const fakeCount = (text: string) => text.length;

function block(title: string, bodyLines: string[]): ParsedBlock {
  // как в реальном файле: после заголовка блока идёт пустая строка
  return { title, explicit: true, lineStart: 1, lineEnd: bodyLines.length + 2, lines: [`## ${title}`, '', ...bodyLines] };
}

test('классификатор: секция N.M', () => {
  assert.deepEqual(classifyHead('## 1.3. Финансовая модель'), { category: 'section', nicheNum: 1, sectionCode: '1.3' });
});

test('классификатор: секция B0.M', () => {
  assert.deepEqual(classifyHead('## B0.2. Маркировка интернет-рекламы'), { category: 'b0-section', sectionCode: 'B0.2' });
});

test('классификатор: группа B0', () => {
  assert.deepEqual(classifyHead('## B0. ОБЩАЯ РЕГУЛЯТОРИКА'), { category: 'b0-group' });
});

test('классификатор: ловушка 0 и 11 — не ниши', () => {
  assert.deepEqual(classifyHead('## 0. ОБЩИЕ ПОЛОЖЕНИЯ'), { category: 'edge-group', sectionCode: '0' });
  assert.deepEqual(classifyHead('## 11. СВОДКА ФИНАНСОВЫХ МОДЕЛЕЙ'), { category: 'edge-group', sectionCode: '11' });
});

test('классификатор: ниша', () => {
  assert.deepEqual(classifyHead('## 2. ОФЛАЙН — ПУНКТ ВЫДАЧИ ЗАКАЗОВ'), { category: 'niche', nicheNum: 2 });
});

test('классификатор: блок', () => {
  assert.deepEqual(classifyHead('## Лист «Кофейня (Москва)»'), { category: 'block' });
  assert.deepEqual(classifyHead('## SOP 1. Открытие смены'), { category: 'block' });
});

test('дробление таблицы: шапка повторяется в каждом куске', () => {
  const header = ['|Параметр|Значение|', '|---|---|'];
  const rows = Array.from({ length: 40 }, (_, i) => `|Строка ${i + 1}|${'х'.repeat(50)}|`);
  const parts = splitBlock(block('Лист «Тест»', [...header, ...rows]), 'table', fakeCount);
  assert.ok(parts.length > 1, 'таблица должна была дробиться');
  // кусок 1 начинается с заголовка блока, затем шапка; куски 2+ — сразу с шапки
  assert.equal(parts[0].lines[0], '## Лист «Тест»');
  assert.equal(parts[0].lines[2], header[0]);
  assert.equal(parts[0].lines[3], header[1]);
  for (const p of parts.slice(1)) {
    assert.equal(p.lines[0], header[0], 'первая строка куска — шапка');
    assert.equal(p.lines[1], header[1], 'вторая строка куска — разделитель');
  }
  // все строки данных сохранены, шапки добавлены сверх
  const dataRows = parts.flatMap((p) => p.lines).filter((l) => l.startsWith('|Строка'));
  assert.deepEqual(dataRows, rows);
});

test('дробление прозы: перекрытие — последний абзац предыдущего = первый абзац следующего', () => {
  const paras = Array.from({ length: 8 }, (_, i) => `Абзац ${i + 1} ${'текст '.repeat(60)}`);
  const parts = splitBlock(block('Реестр ловушек', paras.flatMap((p) => [p, ''])), 'prose', fakeCount);
  assert.ok(parts.length > 1, 'проза должна была дробиться');
  for (let i = 1; i < parts.length; i++) {
    const prevLast = parts[i - 1].lines.filter((l) => l.trim() !== '').pop();
    const curFirst = parts[i].lines.find((l) => l.trim() !== '');
    assert.equal(curFirst, prevLast, `перекрытие между кусками ${i} и ${i + 1}`);
  }
});

test('кейс, SOP и чек-лист не дробятся даже при превышении бюджета', () => {
  const big = Array.from({ length: 60 }, (_, i) => `Строка ${i + 1} ${'х'.repeat(60)}`);
  for (const type of ['case', 'sop', 'checklist'] as const) {
    const parts = splitBlock(block('Заголовок', big), type, fakeCount);
    assert.equal(parts.length, 1, `тип ${type} не должен дробиться`);
  }
});

test('chunk_id: родитель, блок, кусок — по схеме 9.2', () => {
  assert.equal(parentChunkId('coffee_shop', '1.3'), 'coffee_shop-1.3');
  assert.equal(parentChunkId('global', 'B0.2'), 'global-B0.2');
  assert.equal(blockChunkId('coffee_shop-1.3', 1), 'coffee_shop-1.3-b01');
  assert.equal(blockChunkId('coffee_shop-1.3', 12), 'coffee_shop-1.3-b12');
  assert.equal(partChunkId('coffee_shop-1.4-b01', 2, 3), 'coffee_shop-1.4-b01-p2');
  assert.equal(partChunkId('coffee_shop-1.4-b01', 1, 1), 'coffee_shop-1.4-b01');
});

test('parse+emit на маленькой фикстуре: родители, блоки, преамбула, сквозная секция', () => {
  const fixture = [
    '# Тестовый документ',
    '',
    'Вводный абзац преамбулы.',
    '',
    '## 0. ОБЩИЕ ПОЛОЖЕНИЯ',
    '',
    'Тело сквозной секции.',
    '',
    '## 1. НИША ТЕСТ',
    '',
    '## 1.1. Паспорт',
    '',
    'Абзац паспорта.',
    '',
    '## 1.2. Кейсы',
    '',
    '## Кейс один',
    '',
    'Тело кейса.',
    '',
    '## Рыночный фон',
    '',
    'Служебный блок.',
  ];
  const doc = parseDocument(fixture);
  const chunks = buildChunks(doc);
  const ids = chunks.map((c) => c.chunk_id);

  assert.ok(ids.includes('global-preamble'));
  assert.ok(ids.includes('global-0'), 'родитель сквозной секции 0');
  assert.ok(ids.includes('global-0-b01'), 'тело секции 0 — один блок');
  assert.ok(ids.includes('coffee_shop-1.1'), 'родитель childless-секции');
  assert.ok(ids.includes('coffee_shop-1.1-b01'), 'тело секции 1.1 — один блок');
  assert.ok(ids.includes('coffee_shop-1.2-b01'), 'первый блок секции 1.2');
  assert.ok(ids.includes('coffee_shop-1.2-b02'), 'второй блок секции 1.2');

  const kase = chunks.find((c) => c.chunk_id === 'coffee_shop-1.2-b01')!;
  assert.equal(kase.chunk_type, 'case');
  assert.equal(kase.parent_id, 'coffee_shop-1.2');
  assert.equal(kase.chunk_index, 1);
  assert.deepEqual(kase.heading_path, ['1. НИША ТЕСТ', '1.2. Кейсы', 'Кейс один']);

  const service = chunks.find((c) => c.chunk_id === 'coffee_shop-1.2-b02')!;
  assert.equal(service.chunk_type, 'prose', 'служебный блок N.2 без таблицы — prose');

  const parent = chunks.find((c) => c.chunk_id === 'coffee_shop-1.2')!;
  assert.ok(parent.text.includes('Содержит блоки:'));
  assert.ok(parent.text.includes('- Кейс один'));
  assert.equal(parent.parent_id, null);
  assert.equal(parent.chunk_index, 0);

  // покрытие строк без дыр
  const sorted = [...chunks].sort((a, b) => a.line_start - b.line_start);
  assert.equal(sorted[0].line_start, 1);
  for (let i = 1; i < sorted.length; i++) {
    assert.equal(sorted[i].line_start, sorted[i - 1].line_end + 1, `стык ${sorted[i - 1].chunk_id} → ${sorted[i].chunk_id}`);
  }
  assert.equal(sorted[sorted.length - 1].line_end, fixture.length);
});

test('извлечение ссылок: находит «см. раздел B0.2», игнорирует код вне белого списка', () => {
  const chunk = (chunk_id: string, text: string): InternalChunk => ({
    chunk_id,
    source_id: 't',
    business_type: 'global',
    block: 'global',
    section_code: 'B0.1',
    section_title: null,
    block_title: null,
    heading_path: [],
    chunk_type: 'prose',
    topics: [],
    scope: 'global',
    parent_id: 'global-B0.1',
    chunk_index: 1,
    part_index: 1,
    part_total: 1,
    line_start: 1,
    line_end: 5,
    token_count: 0,
    text,
    textLineNums: text.split('\n').map((_, i) => i + 1),
  });

  const links = extractLinks([
    chunk('a', 'Подробности см. раздел B0.2 и раздел 11.'),
    chunk('b', 'Требования раздела B0 применяются везде.'),
    chunk('c', 'Про раздел 6 и раздел 5.3 — игнорируется.'),
    chunk('d', 'Номер статьи: раздел 115-ФЗ не должен совпасть с 11.'),
  ]);

  assert.deepEqual(
    links.map((l) => [l.from_chunk_id, l.to_section]),
    [
      ['a', 'B0.2'],
      ['a', '11'],
      ['b', 'B0'],
    ],
  );
  assert.ok(!links.some((l) => l.to_section === '6' || l.to_section === '5.3'));
});

test('конфиг: белый список ссылок и служебные заголовки N.2 на месте', () => {
  assert.deepEqual(CONFIG.linkWhitelist, ['0', '11', 'B0', 'B0.1', 'B0.2', 'B0.3', 'B0.4', 'B0.5', 'B0.6']);
  assert.equal(CONFIG.serviceN2Headers.length, 3);
  assert.equal(CONFIG.budgetMin, 500);
  assert.equal(CONFIG.budgetMax, 700);
});
