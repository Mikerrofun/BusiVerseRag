// Обёртка над js-tiktoken (план 3, раздел 7).
// Офлайн-счётчик: текст → число токенов. Без ключей, аккаунтов и сети.

import { getEncoding, Tiktoken } from 'js-tiktoken';
import { CONFIG } from '../config/chunking.config';

let encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!encoder) encoder = getEncoding(CONFIG.encoding);
  return encoder;
}

export function countTokens(text: string): number {
  return getEncoder().encode(text).length;
}
