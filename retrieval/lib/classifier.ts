import { CLASSIFIER_SYSTEM_PROMPT, NICHE_CODES, NICHES, isNicheCode } from '../config/niches.config';
import { RETRIEVAL_CONFIG } from '../config/retrieval.config';
import { ClassifierAnswer, NicheCode, NicheDecision } from '../types/retrieval.types';
import { chatCompletion } from './llm-client';

// Определение ниши (план 06, шаг 2). Три уровня по возрастанию стоимости:
// переданная ниша → fulltext-проба → LLM-классификатор.

// Уровень 2: запрос сверяется со словарём ключевых слов. Ровно одна ниша
// совпала → используем её, LLM не вызывается.
function fulltextProbe(query: string): NicheCode[] {
  const q = query.toLowerCase();
  return NICHE_CODES.filter((code) => NICHES[code].keywords.some((kw) => q.includes(kw)));
}

// Мусорный/непарсящийся ответ трактуется как «не определено»
function parseClassifierAnswer(text: string): ClassifierAnswer | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const raw = JSON.parse(jsonMatch[0]) as { niche?: unknown; confidence?: unknown };
    if (typeof raw.niche !== 'string' || typeof raw.confidence !== 'number') return null;
    const confidence = Math.min(1, Math.max(0, raw.confidence));
    return { niche: raw.niche, confidence };
  } catch {
    return null;
  }
}

export async function detectNiche(query: string, uiNiche?: NicheCode): Promise<NicheDecision> {
  // Уровень 1: ниша передана на входе — классификатор не вызывается вообще
  if (uiNiche) return { niche: uiNiche, source: 'ui', confidence: null };

  const matched = fulltextProbe(query);
  if (matched.length === 1) {
    return { niche: matched[0], source: 'fulltext-probe', confidence: null };
  }

  // Уровень 3: LLM-классификатор
  let parsed: ClassifierAnswer | null = null;
  try {
    const answer = await chatCompletion([
      { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
      { role: 'user', content: query },
    ]);
    parsed = parseClassifierAnswer(answer);
    if (
      parsed &&
      isNicheCode(parsed.niche) &&
      parsed.confidence >= RETRIEVAL_CONFIG.classifierThreshold
    ) {
      return { niche: parsed.niche, source: 'llm', confidence: parsed.confidence };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[v0] классификатор недоступен: ${msg}`);
  }

  // Ниже порога / мусорный ответ / ошибка API — поиск без фильтра по всему
  // корпусу: лучше чанки из нескольких ниш, чем отфильтрованная правильная
  return { niche: null, source: 'none', confidence: parsed?.confidence ?? null };
}
