export const EXPAND_CONFIG = {
  // Топ-N хитов всегда получают links (гарантированное расширение)
  linksTopN: 3,
  
  // Хиты ниже topN получают links только если их rerank score >= порога
  // Это защита: "хит слабый по позиции, но если score высокий — может иметь ценные links"
  linksScoreThreshold: 0.7,
  
  // Parent подтягиваем для всех хитов (дешево, контекст секции всегда полезен)
  parentForAll: true,
} as const;
