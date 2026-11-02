// Публичный API retrieval-системы (план 06, правило 4): наружу торчит только
// эта точка. Будущий основной проект импортирует одну функцию — и это весь контракт.
export { retrieve } from './lib/pipeline';
export type {
  ContextChunk,
  NicheCode,
  RetrieveInput,
  RetrievalMeta,
  RetrievalResult,
} from './types/retrieval.types';
