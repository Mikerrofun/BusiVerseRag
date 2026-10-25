/**
 * Пример скрипта для вставки данных в БД
 * 
 * Этот файл демонстрирует, как добавлять источники, чанки и ссылки.
 * В реальном проекте данные будут загружаться из обработанного markdown.
 */

import { db, schema } from '../../db/config/index';
import { sql } from 'drizzle-orm';

async function insertExampleData() {
  try {
    console.log('Вставка примера данных...\n');

    // 1. Добавить источник документа
    await db.insert(schema.sources).values({
      sourceId: 'busiverse-2026-10-13',
      title: 'RAG-документация BusiVerse',
      docVersion: '2026-10-13',
      validFrom: new Date('2026-10-13'),
      contentHash: 'sha256_placeholder_hash',
    });
    console.log('✅ Добавлен источник: busiverse-2026-10-13');

    // 2. Добавить родительский чанк (секцию)
    await db.insert(schema.chunks).values({
      chunkId: 'coffee_shop-1.3',
      sourceId: 'busiverse-2026-10-13',
      businessType: 'coffee_shop',
      block: 'offline',
      sectionCode: '1.3',
      sectionTitle: 'Финансовая модель',
      blockTitle: null,
      headingPath: ['1. ОФЛАЙН — КОФЕЙНЯ', '1.3. Финансовая модель'],
      chunkType: 'prose',
      topics: ['финансовая модель', 'кофейня', 'выручка'],
      scope: 'business',
      parentId: null,
      chunkIndex: 0,
      lineStart: 207,
      lineEnd: 210,
      tokenCount: 150,
      text: 'Финансовая модель кофейни включает расчёт выручки, затрат и прибыли...',
      contentHash: 'hash_of_text_content',
      embedding: null, // Заполнится после генерации эмбеддингов
    });
    console.log('✅ Добавлен родительский чанк: coffee_shop-1.3');

    // 3. Добавить дочерний чанк (таблицу внутри секции)
    await db.insert(schema.chunks).values({
      chunkId: 'coffee_shop-1.3-moscow',
      sourceId: 'busiverse-2026-10-13',
      businessType: 'coffee_shop',
      block: 'offline',
      sectionCode: '1.3',
      sectionTitle: 'Финансовая модель',
      blockTitle: 'Лист «Кофейня (Москва)»',
      headingPath: [
        '1. ОФЛАЙН — КОФЕЙНЯ',
        '1.3. Финансовая модель',
        'Лист «Кофейня (Москва)»',
      ],
      chunkType: 'table',
      topics: ['москва', 'выручка', 'финансы', 'кофейня'],
      scope: 'business',
      parentId: 'coffee_shop-1.3',
      chunkIndex: 1,
      lineStart: 211,
      lineEnd: 250,
      tokenCount: 450,
      text: `| Параметр | Значение |
| Месячная выручка | 750 000 ₽ |
| Чистая прибыль | 120 000 ₽ |
| Рентабельность | 16% |`,
      contentHash: 'hash_of_table_content',
      embedding: null,
    });
    console.log('✅ Добавлен дочерний чанк: coffee_shop-1.3-moscow');

    // 4. Добавить глобальный чанк (применимый ко всем нишам)
    await db.insert(schema.chunks).values({
      chunkId: 'global-0-npd',
      sourceId: 'busiverse-2026-10-13',
      businessType: 'global',
      block: 'global',
      sectionCode: '0',
      sectionTitle: 'Общие положения',
      blockTitle: 'НПД в 2026 году',
      headingPath: ['0. Общие положения', 'НПД в 2026 году'],
      chunkType: 'prose',
      topics: ['НПД', 'налоги', 'самозанятость', '2026'],
      scope: 'global',
      parentId: null,
      chunkIndex: 0,
      lineStart: 16,
      lineEnd: 34,
      tokenCount: 280,
      text: 'Налог на профессиональный доход (НПД) в 2026 году: лимит 2,4 млн руб...',
      contentHash: 'hash_of_npd_content',
      embedding: null,
    });
    console.log('✅ Добавлен глобальный чанк: global-0-npd');

    // 5. Добавить внутреннюю ссылку между чанками
    await db.insert(schema.chunkLinks).values({
      fromChunkId: 'coffee_shop-1.3-moscow',
      toSection: 'B0',
    });
    console.log('✅ Добавлена ссылка: coffee_shop-1.3-moscow → B0');

    console.log('\n✨ Все примеры данных успешно вставлены!');
    console.log('\nТеперь можно:');
    console.log('1. Запустить Drizzle Studio: npm run db:studio');
    console.log('2. Посмотреть данные в таблицах sources, chunks, chunk_links');

  } catch (error) {
    console.error('❌ Ошибка при вставке данных:', error);
    throw error;
  }
}

// Запустить только если вызван напрямую
if (require.main === module) {
  insertExampleData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { insertExampleData };
