// Типы этапа эмбеддингов.

// Строка chunks, нужная для эмбеддинга
export interface ChunkRow {
  chunk_id: string;
  text: string;
  heading_path: string[];
  content_hash: string;
  has_embedding: boolean;
}

export interface JinaEmbeddingData {
  index: number;
  embedding: number[];
}

export interface JinaResponse {
  data: JinaEmbeddingData[];
}
