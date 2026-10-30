// Проход по файлу сверху вниз, конечный автомат «текущая ниша + текущая секция»
// (план 3, раздел 5). Границы читаются из нумерации заголовков, не угадываются.

import { CONFIG } from '../config/chunking.config';
import { classifyHead, headTitle } from './classify';
import { ParsedBlock, ParsedDoc, ParsedGroup, ParsedSection, Scope } from '../types/chunking.types';

export class ParseError extends Error {}

export function parseDocument(lines: string[]): ParsedDoc {
  const doc: ParsedDoc = {
    preamble: { lines: [], lineStart: 1, lineEnd: 0 },
    groups: [],
    h2Count: 0,
    totalLines: lines.length,
  };

  let group: ParsedGroup | null = null;
  let section: ParsedSection | null = null;
  let block: ParsedBlock | null = null;
  let preambleDone = false;

  const closeBlock = (atLine: number) => {
    if (!block) return;
    block.lineEnd = atLine - 1;
    section!.blocks.push(block);
    block = null;
  };

  const closeSection = (atLine: number) => {
    if (!section) return;
    section.lineEnd = atLine - 1;
    finalizeSection(section);
    group!.sections.push(section);
    section = null;
  };

  const closeGroup = (atLine: number) => {
    if (!group) return;
    group.lineEnd = atLine - 1;
    doc.groups.push(group);
    group = null;
  };

  const pushLoose = (line: string) => {
    if (block) block.lines.push(line);
    else if (section) section.introLines.push(line);
    else if (group) group.looseLines.push(line);
    // до первой группы строк не бывает: преамбула обработана отдельно
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];

    if (!preambleDone) {
      if (line.startsWith('## ')) {
        preambleDone = true;
        doc.preamble.lineEnd = lineNo - 1;
      } else {
        doc.preamble.lines.push(line);
        continue;
      }
    }

    if (line.startsWith('## ')) {
      doc.h2Count++;
      const cls = classifyHead(line);
      if (!cls) throw new ParseError(`Заголовок не классифицировался (строка ${lineNo}): ${line}`);

      switch (cls.category) {
        case 'section': {
          if (!group || group.kind !== 'niche') {
            throw new ParseError(`Секция ${cls.sectionCode} встретилась до первой ниши (строка ${lineNo})`);
          }
          closeBlock(lineNo);
          closeSection(lineNo);
          section = newSection(cls.sectionCode!, headTitle(line), lineNo, 'business');
          break;
        }
        case 'b0-section': {
          if (!group || group.kind !== 'b0') {
            throw new ParseError(`Секция ${cls.sectionCode} встретилась до группы B0 (строка ${lineNo})`);
          }
          closeBlock(lineNo);
          closeSection(lineNo);
          section = newSection(cls.sectionCode!, headTitle(line), lineNo, 'global');
          break;
        }
        case 'b0-group':
        case 'edge-group':
        case 'niche': {
          closeBlock(lineNo);
          closeSection(lineNo);
          closeGroup(lineNo);
          if (cls.category === 'niche') {
            group = { kind: 'niche', num: cls.nicheNum!, code: null, title: headTitle(line), lineStart: lineNo, lineEnd: lineNo, looseLines: [], sections: [] };
          } else if (cls.category === 'b0-group') {
            group = { kind: 'b0', num: null, code: null, title: headTitle(line), lineStart: lineNo, lineEnd: lineNo, looseLines: [], sections: [] };
          } else {
            // 0 и 11: сквозные секции без детей, тело секции = один блок-чанк (план 3, раздел 8.2)
            group = { kind: 'edge', num: null, code: cls.sectionCode!, title: headTitle(line), lineStart: lineNo, lineEnd: lineNo, looseLines: [], sections: [] };
            section = newSection(cls.sectionCode!, headTitle(line), lineNo, 'global');
          }
          break;
        }
        case 'block': {
          if (!section) {
            throw new ParseError(`Блок встретился до первой секции (строка ${lineNo}): ${line}`);
          }
          closeBlock(lineNo);
          block = { title: headTitle(line), explicit: true, lineStart: lineNo, lineEnd: lineNo, lines: [line] };
          break;
        }
      }
    } else {
      // H1 после преамбулы (например, «# БЛОК Б. ОНЛАЙН-НИШИ») и прочие строки —
      // не границы, дописываются в текущий открытый контейнер
      pushLoose(line);
    }
  }

  closeBlock(lines.length + 1);
  closeSection(lines.length + 1);
  closeGroup(lines.length + 1);

  return doc;
}

function newSection(code: string, title: string, lineNo: number, scope: Scope): ParsedSection {
  return { code, title, scope, lineStart: lineNo, lineEnd: lineNo, introLines: [], blocks: [], empty: false };
}

// Секция без дочерних блоков: её тело целиком становится одним неявным блоком
// (план 3, раздел 8.2 — правило обобщено на все секции без детей, включая 0, 11 и B0.M)
function finalizeSection(section: ParsedSection) {
  const hasIntroContent = section.introLines.some((l) => l.trim() !== '');
  if (section.blocks.length === 0 && hasIntroContent) {
    section.blocks.push({
      title: null,
      explicit: false,
      lineStart: section.lineStart + 1,
      lineEnd: section.lineEnd,
      lines: section.introLines,
    });
    section.introLines = [];
  }
  if (section.blocks.length === 0 && !hasIntroContent) {
    section.empty = true;
  }
}

// Служебное: сверка счётчиков разбора с ожидаемыми (план 3, раздел 14.2).
// Расхождение означает ошибку классификации — падаем со списком, а не молча выдаём мусор.
export function assertStructure(doc: ParsedDoc): void {
  const errors: string[] = [];
  const exp = CONFIG.expected;

  if (doc.h2Count !== exp.h2Total) errors.push(`H2 всего: ${doc.h2Count}, ожидалось ${exp.h2Total}`);

  const niches = doc.groups.filter((g) => g.kind === 'niche');
  if (niches.length !== exp.niches) errors.push(`Ниш: ${niches.length}, ожидалось ${exp.niches}`);
  niches.forEach((g, i) => {
    if (g.num !== i + 1) errors.push(`Ниши идут не по порядку: позиция ${i + 1}, ниша ${g.num}`);
    if (g.sections.length !== exp.sectionsPerNiche) {
      errors.push(`Ниша ${g.num}: секций ${g.sections.length}, ожидалось ${exp.sectionsPerNiche}`);
    }
    g.sections.forEach((s, j) => {
      const wantCode = `${g.num}.${j + 1}`;
      if (s.code !== wantCode) errors.push(`Ниша ${g.num}: код секции ${s.code}, ожидался ${wantCode}`);
      if (s.empty) errors.push(`Секция ${s.code} без введения и без дочерних блоков (план 3, раздел 8.2)`);
    });
  });

  const b0 = doc.groups.find((g) => g.kind === 'b0');
  if (!b0) errors.push('Группа B0 не найдена');
  else if (b0.sections.length !== exp.b0Sections) {
    errors.push(`Секций B0.*: ${b0.sections.length}, ожидалось ${exp.b0Sections}`);
  }

  const edges = doc.groups.filter((g) => g.kind === 'edge');
  for (const code of ['0', '11']) {
    if (!edges.some((g) => g.code === code)) errors.push(`Сквозная секция ${code} не найдена`);
  }

  const explicitBlocks = doc.groups.flatMap((g) => g.sections).flatMap((s) => s.blocks).filter((b) => b.explicit);
  if (explicitBlocks.length !== exp.explicitBlocks) {
    errors.push(`Явных блоков: ${explicitBlocks.length}, ожидалось ${exp.explicitBlocks}`);
  }

  const sop = explicitBlocks.filter((b) => /^SOP[- ]\d/.test(b.title ?? '')).length;
  if (sop !== exp.sopBlocks) errors.push(`SOP-блоков: ${sop}, ожидалось ${exp.sopBlocks}`);

  if (errors.length > 0) {
    throw new ParseError(`Структура файла не совпала с ожидаемой:\n- ${errors.join('\n- ')}`);
  }
}
