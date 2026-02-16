import { chunk as llmChunk } from 'llm-chunk';

/**
 * Chunk with overlap using llm-chunk (efficient, avoids RangeError with long text)
 */
export interface Chunk {
  text: string;
  startIndex: number;
  endIndex: number;
}

export interface ChunkingOptions {
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
}

const DEFAULT_OPTIONS: ChunkingOptions = {
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', ' ', ''],
};

export function chunkText(text: string, options: Partial<ChunkingOptions> = {}): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (!text?.trim()) return [];

  try {
    const strings = llmChunk(text, {
      minLength: 0,
      maxLength: opts.chunkSize,
      overlap: opts.chunkOverlap,
      splitter: 'paragraph',
    });
    let offset = 0;
    return (Array.isArray(strings) ? strings : []).map((t) => {
      const s = String(t);
      const startIndex = offset;
      offset += s.length;
      return { text: s, startIndex, endIndex: offset };
    });
  } catch (err) {
    console.warn('[Chunking] llm-chunk error:', err instanceof Error ? err.message : err);
    return [];
  }
}
