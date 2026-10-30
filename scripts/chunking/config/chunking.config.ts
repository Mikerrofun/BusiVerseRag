// Все константы этапа чанкования (план 3, раздел 11.1).
// Логика не содержит ни магических чисел, ни инлайн-списков — только отсюда.

import * as path from 'path';

export const CONFIG = {
  // Версия документа — дата актуальности из преамбулы (план 3, раздел 15)
  sourceId: 'busiverse-2026-10-13',

  // Офлайн-счётчик токенов (план 3, раздел 7.1). Меняется одной строкой при смене модели эмбеддингов
  encoding: 'o200k_base',

  // Бюджет чанка из плана 1
  budgetMin: 500,
  budgetMax: 700,

  // Перекрытие прозы считается в абзацах: последний абзац куска повторяется первым абзацем следующего
  proseOverlapParagraphs: 1,

  // Балансировка хвостового куска дробления: если последний кусок меньше этого порога,
  // в него переносятся сегменты из предыдущего (огрызок в 1–2 строки плох для поиска).
  // Предыдущий кусок при этом не опускается ниже того же порога
  rebalanceFloorTokens: 250,

  inputPath: path.resolve(__dirname, '../../../RAG-документация_BusiVerse.md'),
  outputDir: path.resolve(__dirname, '../../../data/chunks'),

  // Маппинг ниш: номер → slug папки и business_type (план 3, раздел 9.3).
  // Новый файл с новыми нишами → дописать сюда (docs/chunking-file-requirements.md, раздел 2.3)
  nicheMap: [
    { num: 1, slug: 'coffee', businessType: 'coffee_shop' },
    { num: 2, slug: 'pickup', businessType: 'pickup_point' },
    { num: 3, slug: 'bakery', businessType: 'mini_bakery' },
    { num: 4, slug: 'manicure', businessType: 'manicure_studio' },
    { num: 5, slug: 'auto', businessType: 'auto_service' },
    { num: 6, slug: 'seller', businessType: 'marketplace_seller' },
    { num: 7, slug: 'school', businessType: 'online_school' },
    { num: 8, slug: 'smm', businessType: 'smm_agency' },
    { num: 9, slug: 'store', businessType: 'own_online_store' },
    { num: 10, slug: 'accounting', businessType: 'remote_accounting' },
  ],

  // Служебные заголовки N.2 (не кейсы). Фиксированный список; пополняется руками
  // после человеческой проверки (план 3, раздел 6.1)
  serviceN2Headers: [
    'Рыночный фон',
    'Примеры смены стратегии (pivot)',
    'Типовые сценарии закрытия в первые 6–12 месяцев',
  ],

  // Белый список кодов для внутренних ссылок «см. раздел X» (план 3, раздел 10)
  linkWhitelist: ['0', '11', 'B0', 'B0.1', 'B0.2', 'B0.3', 'B0.4', 'B0.5', 'B0.6'],

  // Ожидаемые счётчики по фактическому очищенному файлу (план 3, раздел 3).
  // Расхождение означает ошибку классификации — скрипт падает
  expected: {
    h2Total: 302,
    niches: 10,
    sectionsPerNiche: 8,
    b0Sections: 6,
    explicitBlocks: 203,
    sopBlocks: 64,
  },
} as const;

export function nicheByNum(num: number) {
  return CONFIG.nicheMap.find((n) => n.num === num);
}
