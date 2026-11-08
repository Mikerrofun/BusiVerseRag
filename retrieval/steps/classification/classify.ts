import { NICHE_CODES, NICHES, isNicheCode } from '../../config/niches.config';
import { NicheCode } from '../../types/retrieval.types';
import { chatCompletion } from '../../lib/llm-client';
import { CLASSIFICATION_CONFIG } from './classification.config';
import { ClassifierAnswer, NicheDecision } from './classification.types';

function fulltextProbe(query: string): NicheCode[] {
  const q = query.toLowerCase();
  return NICHE_CODES.filter((code) => NICHES[code].keywords.some((kw) => q.includes(kw)));
}

function parseAnswer(text: string): ClassifierAnswer | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const raw = JSON.parse(jsonMatch[0]) as { niche?: unknown; confidence?: unknown };
    if (typeof raw.niche !== 'string' || typeof raw.confidence !== 'number') return null;
    return { niche: raw.niche, confidence: Math.min(1, Math.max(0, raw.confidence)) };
  } catch {
    return null;
  }
}

export async function detectNiche(query: string, uiNiche?: NicheCode | null): Promise<NicheDecision> {
  //Ниша передана — классификатор не вызывается вообще
  if (uiNiche) return { niche: uiNiche, source: 'ui', confidence: null };

  const matched = fulltextProbe(query);
  if (matched.length === 1) {
    return { niche: matched[0], source: 'fulltext-probe', confidence: null };
  }

  let parsed: ClassifierAnswer | null = null;
  try {
    const answer = await chatCompletion([
      { role: 'system', content: CLASSIFICATION_CONFIG.systemPrompt },
      { role: 'user', content: query },
    ]);
    parsed = parseAnswer(answer);
    if (
      parsed &&
      isNicheCode(parsed.niche) &&
      parsed.confidence >= CLASSIFICATION_CONFIG.threshold
    ) {
      return { niche: parsed.niche, source: 'llm', confidence: parsed.confidence };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[v0] классификатор недоступен: ${msg}`);
  }

  // Ниже порога / мусорный ответ / ошибка API — поиск без фильтра:
  // лучше чанки из нескольких ниш, чем отфильтрованная правильная
  return { niche: null, source: 'none', confidence: parsed?.confidence ?? null };
}
