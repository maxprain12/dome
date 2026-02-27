import { indexResource } from '../db/pageindex';

export interface IngestionResult {
  success: boolean;
  chunksProcessed: number;
  error?: string;
}

/**
 * Ingest a resource into PageIndex for reasoning-based RAG.
 * Only PDF resources are supported — PageIndex works directly with PDF files.
 * For other resource types, returns success with 0 chunks (FTS handles text search).
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
    if (metadata.type !== 'pdf') {
      // PageIndex only indexes PDFs; other types are covered by SQLite FTS
      return { success: true, chunksProcessed: 0 };
    }

    console.log(`[Ingestion] Starting PageIndex indexing for resource ${resourceId}`);
    const result = await indexResource(resourceId);

    if (!result.success) {
      console.warn('[Ingestion] PageIndex indexing failed:', result.error);
      return { success: false, chunksProcessed: 0, error: result.error };
    }

    console.log(`[Ingestion] PageIndex indexing complete for resource ${resourceId}`);
    return { success: true, chunksProcessed: 1 };

  } catch (error) {
    console.error('[Ingestion] Error ingesting resource:', error);
    return {
      success: false,
      chunksProcessed: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
