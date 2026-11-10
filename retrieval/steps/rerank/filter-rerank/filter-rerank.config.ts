/**
 * Two-stage relevance filter thresholds calibrated from the 30-question eval run:
 * the max-score gate abstains on noisy result sets; the individual threshold trims
 * weak tail results. See docs/eval/fullEvalRun-11102026-eval-improve.md.
 */
export const FILTER_RERANK_CONFIG = {
  maxThreshold: 0.3,
  individualThreshold: 0.25,
} as const;
