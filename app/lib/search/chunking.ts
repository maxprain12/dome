
/**
 * Simple text chunking utility
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
  separators: ["\n\n", "\n", " ", ""],
};

export function chunkText(text: string, options: Partial<ChunkingOptions> = {}): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: Chunk[] = [];
  
  if (!text) return chunks;

  let startIndex = 0;
  
  while (startIndex < text.length) {
    let endIndex = startIndex + opts.chunkSize;
    
    if (endIndex >= text.length) {
      endIndex = text.length;
    } else {
        // Try to find a separator to break at
        let splitFound = false;
        for (const separator of opts.separators || []) {
            const lastSeparatorIndex = text.lastIndexOf(separator, endIndex);
            if (lastSeparatorIndex > startIndex) {
                endIndex = lastSeparatorIndex + separator.length;
                splitFound = true;
                break;
            }
        }
    }

    chunks.push({
      text: text.slice(startIndex, endIndex),
      startIndex,
      endIndex,
    });

    startIndex = endIndex - opts.chunkOverlap;
    // Prevent infinite loops if overlap >= chunksize or no progress
    if (startIndex >= endIndex) {
        startIndex = endIndex; 
    }
  }

  return chunks;
}
