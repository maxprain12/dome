/**
 * Trigger local semantic (Nomic) re-index for a resource (chunks in SQLite).
 */
export interface IngestionResult {
  success: boolean;
  chunksProcessed: number;
  error?: string;
}

export async function ingestResource(
  resourceId: string,
  _content: string,
  metadata: {
    title: string;
    type: string;
    projectId: string;
    [key: string]: unknown;
  },
  _options: Record<string, unknown> = {},
): Promise<IngestionResult> {
  try {
    if (!['pdf', 'document', 'url', 'notebook', 'note', 'ppt', 'excel', 'image'].includes(metadata.type)) {
      return { success: true, chunksProcessed: 0 };
    }

    const res = await window.electron.db.semantic.indexResource(resourceId);
    if (!res.success) {
      return { success: false, chunksProcessed: 0, error: res.error };
    }
    const data = res.data as { chunks?: number; ok?: boolean; error?: string } | undefined;
    const chunks = typeof data?.chunks === 'number' ? data.chunks : 0;
    if (data?.ok === false && data?.error) {
      return { success: false, chunksProcessed: 0, error: String(data.error) };
    }
    return { success: true, chunksProcessed: chunks };
  } catch (error) {
    console.error('[Ingestion] semantic indexResource:', error);
    return {
      success: false,
      chunksProcessed: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
