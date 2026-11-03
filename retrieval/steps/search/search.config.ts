export const SEARCH_CONFIG = {
  // Глубина каждого из двух поисков
  topK: 40,
  // Кириллические термины короче не префиксуются в FTS-запросе
  ftsPrefixMinLength: 3,
} as const;
