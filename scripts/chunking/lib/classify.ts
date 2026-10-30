// Классификатор заголовков (план 3, раздел 4).
// Уровень заголовка не важен, важен шаблон. Порядок проверок важен — первое совпадение выигрывает.

import { ClassifiedHead } from '../types/chunking.types';

const SECTION_RE = /^## (\d{1,2})\.(\d{1,2})\.(?:\s|$)/; // ## 1.3. Финансовая модель
const B0_SECTION_RE = /^## B0\.(\d{1,2})\.(?:\s|$)/; // ## B0.2. Маркировка…
const B0_GROUP_RE = /^## B0\.(?:\s|$)/; // ## B0. ОБЩАЯ РЕГУЛЯТОРИКА…
const EDGE_GROUP_RE = /^## (0|11)\.(?:\s|$)/; // ## 0. / ## 11. — ловушка: совпадают с шаблоном ниши
const NICHE_RE = /^## (\d{1,2})\.(?:\s|$)/; // ## 2. ОФЛАЙН — ПВЗ…

export function classifyHead(line: string): ClassifiedHead | null {
  if (!line.startsWith('## ')) return null;

  let m = SECTION_RE.exec(line);
  if (m) return { category: 'section', nicheNum: Number(m[1]), sectionCode: `${m[1]}.${m[2]}` };

  m = B0_SECTION_RE.exec(line);
  if (m) return { category: 'b0-section', sectionCode: `B0.${m[1]}` };

  m = B0_GROUP_RE.exec(line);
  if (m) return { category: 'b0-group' };

  m = EDGE_GROUP_RE.exec(line);
  if (m) return { category: 'edge-group', sectionCode: m[1] };

  m = NICHE_RE.exec(line);
  if (m) {
    const num = Number(m[1]);
    if (num >= 1 && num <= 10) return { category: 'niche', nicheNum: num };
  }

  return { category: 'block' };
}

export function headTitle(line: string): string {
  return line.replace(/^#+\s*/, '').trim();
}
