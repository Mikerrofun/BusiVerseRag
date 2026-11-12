/**
 * Two-stage relevance filter thresholds calibrated from diagnostic eval runs:
 * - maxThreshold: gates the entire result set; abstains on noisy queries
 * - individualThreshold: trims weak tail results from passed sets
 * 
 * Calibration data (fullEvalRun-11132026-retrievalFilterDiagnosticAttemp2):
 * - Garbage boundary: 0.1606 (q-hard-03, rejected)
 * - Correct boundary: 0.20+ (most relevant hits)
 * - Critical case: q-hard-01 has expected chunk at 0.1761 (requires threshold ≤ 0.176)
 * 
 * Current settings balance precision (58.8%) and recall (80.6%) with 89.7% hit rate.
 * See docs/eval/fullEvalRun-11132026-retrievalFilterDiagnosticAttemp2/
 */
export const FILTER_RERANK_CONFIG = {
  maxThreshold: 0.18,
  individualThreshold: 0.15,
} as const;
