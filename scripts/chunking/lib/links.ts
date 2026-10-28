// Извлечение внутренних ссылок «см. раздел X» (план 3, раздел 10).
// Механический шаг, не LLM: фразы «см. раздел X» / «раздел X», где X — код из белого списка.

import { CONFIG } from '../config/chunking.config';
import { ChunkLink, InternalChunk } from '../types/chunking.types';

// «раздел», «раздела», «разделе» и т.п. — падежные формы тоже ссылки;
// код проверяется по белому списку, поэтому «раздел 6–10» или «раздел 115-ФЗ» отфильтруются
const LINK_RE = /(?:см\.\s*)?раздел[а-яё]*\s+(B0(?:\.\d+)?|\d{1,2}(?:\.\d+)?)(?!\d)/gi;

export function extractLinks(chunks: InternalChunk[]): ChunkLink[] {
  const seen = new Set<string>();
  const out: ChunkLink[] = [];

  for (const chunk of chunks) {
    // преамбула не ищется: в ней нет перекрёстных ссылок на разделы
    if (chunk.chunk_id === 'global-preamble') continue;
    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(chunk.text)) !== null) {
      const code = m[1];
      if (!CONFIG.linkWhitelist.includes(code)) continue;
      const key = `${chunk.chunk_id}|${code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const lineIdx = chunk.text.slice(0, m.index).split('\n').length - 1;
      out.push({
        from_chunk_id: chunk.chunk_id,
        to_section: code,
        first_line: chunk.textLineNums[lineIdx] ?? chunk.line_start,
      });
    }
  }
  return out;
}
