import { ContextChunk } from '../../types/retrieval.types';

export interface AssembledContext {
  context: string;
  chunks: ContextChunk[];
  truncated: boolean;
  usedCount: number;
}
