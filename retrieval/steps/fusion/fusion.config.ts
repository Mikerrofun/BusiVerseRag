export const FUSION_CONFIG = {
  // Константа RRF (Cormack et al., 2009): сглаживает разницу рангов внутри списка
  k: 60,
  // Отрезка после слияния — буфер полноты для rerank
  topK: 20,
} as const;
