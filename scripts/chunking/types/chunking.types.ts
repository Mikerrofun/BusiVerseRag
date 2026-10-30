// Все типы этапа чанкования (план 3, раздел 11.1).
// Логика не содержит инлайн-типов — только отсюда.

export type ChunkType = 'sop' | 'checklist' | 'case' | 'table' | 'prose';
export type Scope = 'global' | 'business';
export type BlockKind = 'offline' | 'online' | 'global';

// Категория H2-заголовка (план 3, раздел 4). Порядок проверок — в classify.ts.
export type HeadCategory =
  | 'section' // ## N.M.
  | 'b0-section' // ## B0.M.
  | 'b0-group' // ## B0.
  | 'edge-group' // ## 0. / ## 11.
  | 'niche' // ## N.
  | 'block'; // всё остальное H2

export interface ClassifiedHead {
  category: HeadCategory;
  nicheNum?: number;
  sectionCode?: string;
}

// --- Результат разбора файла ---

export interface ParsedBlock {
  title: string | null; // null у неявного блока (тело секции без дочерних H2)
  explicit: boolean;
  lineStart: number; // 1-based; у явного блока — строка заголовка
  lineEnd: number;
  lines: string[]; // тело блока, у явного — включая строку заголовка
}

export interface ParsedSection {
  code: string; // "1.3", "B0.2", "0", "11"
  title: string; // заголовок без "## "
  scope: Scope;
  lineStart: number;
  lineEnd: number;
  introLines: string[]; // строки между заголовком секции и первым дочерним H2
  blocks: ParsedBlock[];
  empty: boolean; // нет ни детей, ни введения — валидатор падает
}

export interface ParsedGroup {
  kind: 'niche' | 'b0' | 'edge';
  num: number | null; // для ниши
  code: string | null; // "0" / "11" для edge
  title: string;
  lineStart: number;
  lineEnd: number;
  looseLines: string[]; // строки между заголовком группы и первой секцией
  sections: ParsedSection[];
}

export interface ParsedDoc {
  preamble: { lines: string[]; lineStart: number; lineEnd: number };
  groups: ParsedGroup[];
  h2Count: number;
  totalLines: number;
}

// --- Чанк ---

export interface ChunkMeta {
  chunk_id: string;
  source_id: string;
  business_type: string;
  block: BlockKind;
  section_code: string | null;
  section_title: string | null;
  block_title: string | null;
  heading_path: string[];
  chunk_type: ChunkType;
  topics: string[];
  scope: Scope;
  parent_id: string | null;
  chunk_index: number;
  part_index: number;
  part_total: number;
  line_start: number;
  line_end: number;
  token_count: number;
}

// Внутреннее представление при построении: текст с построчной привязкой к файлу.
export interface InternalChunk extends ChunkMeta {
  text: string;
  // Номер файла-строки для каждой строки text (для извлечения ссылок и валидации перекрытия)
  textLineNums: number[];
}

// Формат JSON-файла чанка (план 3, раздел 9.1) — плоский, как строка таблицы chunks.
export type ChunkFile = ChunkMeta & {
  text: string;
  content_hash: string;
};

export interface ChunkLink {
  from_chunk_id: string;
  to_section: string;
  first_line: number; // строка очищенного файла, где найдено первое вхождение
}

// --- Дробление ---

export interface SplitPart {
  lines: string[]; // строки куска (пустые строки внутри сохраняются как есть)
  lineNums: number[]; // номер файла-строки для каждой строки lines
  lineStart: number; // строка файла, с которой начинается НОВОЕ содержимое куска
  // (без повторяемого материала: шапки таблицы / перекрывающего абзаца)
}

// --- Отчёт прогона ---

export interface ReportStats {
  niches: number;
  sections: number;
  explicitBlocks: number;
  implicitBlocks: number;
  sopBlocks: number;
  chunksTotal: number;
  parents: number;
  blocksTotal: number;
  partsExtra: number;
  byType: Record<ChunkType, number>;
  tokenMin: number;
  tokenMax: number;
  tokenAvg: number;
  overBudget: { chunk_id: string; chunk_type: ChunkType; token_count: number }[];
  underBudget: { chunk_id: string; token_count: number }[];
  links: number;
  notes: string[];
}
