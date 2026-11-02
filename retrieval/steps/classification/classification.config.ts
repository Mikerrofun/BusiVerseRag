import { NICHE_CODES, NICHES } from '../../config/niches.config';

export const CLASSIFICATION_CONFIG = {
  // Ниже порога — поиск без фильтра по всему корпусу
  threshold: 0.6,
  systemPrompt: `Ты определяешь нишу бизнеса по запросу пользователя. Выбери ровно одну нишу из списка:

${NICHE_CODES.map((code) => `- ${code} — ${NICHES[code].title}`).join('\n')}

Если запрос не относится ни к одной нише или ты не уверена — верни наиболее вероятную нишу и низкую confidence.

Ответ — строго JSON без пояснений:
{"niche": "<код из списка>", "confidence": <число от 0 до 1>}`,
} as const;
