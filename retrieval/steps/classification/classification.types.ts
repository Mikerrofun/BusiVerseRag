import { NicheCode, NicheSource } from '../../types/retrieval.types';

export interface NicheDecision {
  niche: NicheCode | null;
  source: NicheSource;
  confidence: number | null;
}

/** Ответ LLM-классификатора (строго JSON) */
export interface ClassifierAnswer {
  niche: string;
  confidence: number;
}
