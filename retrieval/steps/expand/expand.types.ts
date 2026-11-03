import { ChunkRow, ScoredChunk } from '../../types/retrieval.types';

/** Единица контекста: блок целиком / родитель-секция / ссылка */
export interface ContextUnit {
  kind: 'block' | 'parent' | 'link';
  /** Готовый текст единицы: для блока — куски, склеенные по порядку */
  text: string;
  /** heading_path единицы для заголовка-источника */
  heading: string;
  /** Лучший rerank-скор хита, приведшего к единице */
  score: number;
  /** Все чанки, вошедшие в единицу (куски блока либо один чанк) */
  parts: ChunkRow[];
}

/** Группа контекста: блок хита + его родитель + его ссылки */
export interface ExpandedGroup {
  /** Ключ блока: parent_id + chunk_index — для дедупа хитов одного блока */
  key: string;
  /** Лучший rerank-скор хитов группы */
  score: number;
  block: ContextUnit;
  parent: ContextUnit | null;
  links: ContextUnit[];
  /** Хиты, попавшие в этот блок */
  hits: ScoredChunk[];
}
