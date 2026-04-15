import { indexResource } from '../db/pageindex';

export interface IngestionResult {
  success: boolean;
  chunksProcessed: number;
  error?: string;
}

/**
 * Ingest a resource into PageIndex for reasoning-based RAG.
 * Dome now indexes several text-bearing resource types using the same tree format:
 * PDFs, notes, notebooks, processed URLs, and extracted document content.
 */
export async function ingestResource(
  resourceId: string,
  _content: string,
  metadata: {
    title: string;
    type: string;
    projectId: string;
    [key: string]: unknown;
  },
  _options: Record<string, unknown> = {}
): Promise<IngestionResult> {
  try {
    if (!['pdf', 'document', 'url', 'notebook'].includes(metadata.type)) {
      return { success: true, chunksProcessed: 0 };
    }

    console.info(`[Ingestion] Starting PageIndex indexing for resource ${resourceId}`);
    const result = await indexResource(resourceId);

    if (!result.success) {
      console.warn('[Ingestion] PageIndex indexing failed:', result.error);
      return { success: false, chunksProcessed: 0, error: result.error };
    }

    console.info(`[Ingestion] PageIndex indexing complete for resource ${resourceId}`);
    return { success: true, chunksProcessed: result.nodeCount ?? 0 };

  } catch (error) {
    console.error('[Ingestion] Error ingesting resource:', error);
    return {
      success: false,
      chunksProcessed: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
