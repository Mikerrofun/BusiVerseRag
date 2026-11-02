import { NicheCode } from '../types/retrieval.types';

export interface NicheDef {
  title: string;
  /** Ключевые слова для fulltext-пробы: подстроки, сверьаются с запросом в нижнем регистре */
  keywords: string[];
}

// 10 ниш (план 01, раздел 2.2). Ключи = коды business_type в БД.
export const NICHES: Record<NicheCode, NicheDef> = {
  coffee_shop: { title: 'Кофейня «кофе с собой»', keywords: ['кофейн', 'бариста'] },
  pickup_point: { title: 'ПВЗ маркетплейса', keywords: ['пвз', 'пункт выдачи'] },
  mini_bakery: { title: 'Мини-пекарня', keywords: ['пекарн'] },
  manicure_studio: { title: 'Маникюрная студия', keywords: ['маникюр'] },
  auto_service: { title: 'Автосервис, 2 поста', keywords: ['автосервис', 'автомастерск'] },
  marketplace_seller: { title: 'Селлер на маркетплейсе', keywords: ['маркетплейс', 'селлер'] },
  online_school: { title: 'Онлайн-школа', keywords: ['онлайн-школ'] },
  smm_agency: { title: 'SMM / маркетинговое агентство', keywords: ['smm'] },
  own_online_store: { title: 'Интернет-магазин на своём сайте', keywords: ['интернет-магазин'] },
  remote_accounting: { title: 'Удалённая бухгалтерия', keywords: ['бухгалтер'] },
};

export const NICHE_CODES = Object.keys(NICHES) as NicheCode[];

export function isNicheCode(value: string): value is NicheCode {
  return Object.prototype.hasOwnProperty.call(NICHES, value);
}

// Системный промпт классификатора — настройка, не логика (план 06, задача 4).
// На выходе требуется строго JSON без пояснений.
export const CLASSIFIER_SYSTEM_PROMPT = `Ты определяешь нишу бизнеса по запросу пользователя. Выбери ровно одну нишу из списка:

${(Object.keys(NICHES) as NicheCode[]).map((code) => `- ${code} — ${NICHES[code].title}`).join('\n')}

Если запрос не относится ни к одной нише или ты не уверена — верни нишу, которая кажется наиболее вероятной, и низкую confidence.

Ответ — строго JSON без пояснений, в формате:
{"niche": "<код из списка>", "confidence": <число от 0 до 1>}`;
