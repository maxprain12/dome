/**
 * PageIndex Client - Renderer Process
 *
 * Reasoning-based RAG client. Replaces the embedding-based vector.ts.
 * All operations go through IPC to the main process, which coordinates
 * with a Python subprocess running the real PageIndex package.
 */

export interface PageIndexSearchResult {
  resource_id: string;
  title: string;
  type: string;
  project_id?: string;
  node_id?: string;
  pages: number[];
  page_range?: string;
  text: string;
  node_title: string;
  node_path?: string[];
  score: number;
}

export interface PageIndexSearchResponse {
  success: boolean;
  query?: string;
  method?: string;
  count?: number;
  results?: PageIndexSearchResult[];
  message?: string;
  error?: string;
}

export interface PageIndexStatus {
  success: boolean;
  running: boolean;
  provider?: string;
  model?: string;
  indexed_documents?: number;
  last_indexed_at?: number | null;
  error?: string;
}

export type IndexingStatus = 'none' | 'pending' | 'processing' | 'done' | 'error';

export interface ResourceIndexStatus {
  success: boolean;
  resourceId?: string;
  status: IndexingStatus;
  progress: number;
  step?: string;
  error?: string | null;
  indexed_at?: number;
  model_used?: string;
}

/**
 * Get the indexing status for a specific resource.
 * Returns live state while processing, persisted state when done.
 */
export async function getResourceIndexStatus(resourceId: string): Promise<ResourceIndexStatus> {
  if (typeof window === 'undefined' || !window.electron) {
    return { success: false, status: 'none', progress: 0 };
  }
  try {
    return await window.electron.invoke('pageindex:resource-status', { resourceId });
  } catch (error) {
    return { success: false, status: 'none', progress: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Get PageIndex service status.
 */
export async function getPageIndexStatus(): Promise<PageIndexStatus> {
  if (typeof window === 'undefined' || !window.electron) {
    return { success: false, running: false, error: 'Electron not available' };
  }
  try {
    return await window.electron.invoke('pageindex:status');
  } catch (error) {
    return { success: false, running: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Ensure the PageIndex Python runner can start.
 * The subprocess is started lazily; call this to surface any setup errors.
 */
export async function startPageIndex(): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined' || !window.electron) {
    return { success: false, error: 'Electron not available' };
  }
  try {
    return await window.electron.invoke('pageindex:start');
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Index a PDF resource — generates the hierarchical PageIndex tree.
 * @param resourceId - ID of the PDF resource to index
 */
export async function indexResource(resourceId: string): Promise<{ success: boolean; error?: string; nodeCount?: number }> {
  if (typeof window === 'undefined' || !window.electron) {
    return { success: false, error: 'Electron not available' };
  }
  try {
    return await window.electron.invoke('pageindex:index', { resourceId });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Reasoning-based semantic search across indexed PDF documents.
 * @param query - Natural language query
 * @param resourceIds - Optional list of resource IDs to restrict search
 * @param topK - Maximum number of results
 */
export async function searchWithPageIndex(
  query: string,
  resourceIds?: string[],
  topK: number = 5
): Promise<PageIndexSearchResponse> {
  if (typeof window === 'undefined' || !window.electron) {
    return { success: false, error: 'Electron not available' };
  }
  try {
    return await window.electron.invoke('pageindex:search', { query, resourceIds, topK });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Remove the PageIndex tree for a specific resource.
 * Call this when a PDF resource is deleted or replaced.
 */
export async function deletePageIndex(resourceId: string): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined' || !window.electron) {
    return { success: false, error: 'Electron not available' };
  }
  try {
    return await window.electron.invoke('pageindex:delete', { resourceId });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Re-index all PDF resources in the library.
 * Long-running operation; call from a settings panel.
 */
export async function reindexAllDocuments(): Promise<{
  success: boolean;
  indexed?: number;
  failed?: number;
  total?: number;
  error?: string;
}> {
  if (typeof window === 'undefined' || !window.electron) {
    return { success: false, error: 'Electron not available' };
  }
  try {
    return await window.electron.invoke('pageindex:reindex');
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
