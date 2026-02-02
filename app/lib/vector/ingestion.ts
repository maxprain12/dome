import { chunkText } from './chunking';
import type { ChunkingOptions } from './chunking';
import { insertResourceEmbeddings } from '../db/vector';
import type { ResourceEmbedding } from '../db/vector';

export interface IngestionResult {
  success: boolean;
  chunksProcessed: number;
  error?: string;
}

export async function ingestResource(
  resourceId: string,
  content: string,
  metadata: {
    title: string;
    type: string;
    projectId: string;
    [key: string]: any;
  },
  options: Partial<ChunkingOptions> = {}
): Promise<IngestionResult> {
  try {
    if (!content) {
      return { success: true, chunksProcessed: 0 };
    }

    console.log(`[Ingestion] Starting ingestion for resource ${resourceId}`);

    // 1. Chunking
    const chunks = chunkText(content, options);
    console.log(`[Ingestion] Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      return { success: true, chunksProcessed: 0 };
    }

    // 2. Embedding Generation & Preparation
    const embeddings: ResourceEmbedding[] = [];
    
    // Process in batches to avoid overloading Ollama
    const BATCH_SIZE = 5;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (chunk, batchIndex) => {
            const globalIndex = i + batchIndex;
            try {
                // Generate embedding via Electron/Ollama
                // Assuming window.electron.ollama.generateEmbedding returns { embedding: number[] } or similar
                // We need to verify the return signature. Usually it's an object or the array directly.
                // Let's assume it returns the response from Ollama API: { embedding: [...] }
                const response = await window.electron.ollama.generateEmbedding(chunk.text);
                
                // Handle different response formats (just array, or object)
                const vector = Array.isArray(response) ? response : response.embedding;

                if (vector) {
                    embeddings.push({
                        id: `${resourceId}-${globalIndex}`,
                        resource_id: resourceId,
                        chunk_index: globalIndex,
                        text: chunk.text,
                        vector: vector,
                        metadata: {
                            ...metadata,
                            resource_type: metadata.type,
                            title: metadata.title,
                            project_id: metadata.projectId,
                            created_at: Date.now()
                        }
                    });
                }
            } catch (err) {
                console.error(`[Ingestion] Error generating embedding for chunk ${globalIndex}:`, err);
            }
        }));
    }

    // 3. Storage
    if (embeddings.length > 0) {
        await insertResourceEmbeddings(embeddings);
        console.log(`[Ingestion] Successfully indexed ${embeddings.length} chunks`);
    }

    return { success: true, chunksProcessed: embeddings.length };

  } catch (error) {
    console.error('[Ingestion] Error ingesting resource:', error);
    return { success: false, chunksProcessed: 0, error: error instanceof Error ? error.message : String(error) };
  }
}
