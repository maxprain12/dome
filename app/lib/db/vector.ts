/**
 * Vector Database Client - Renderer Process
 * Communicates with the main process via IPC for vector operations
 *
 * IMPORTANT: This file runs in the renderer process (Next.js)
 * All vector database operations should be handled by the main process via IPC
 * 
 * NOTE: Vector DB operations are currently not fully implemented via IPC.
 * This file provides type definitions and stubs for future IPC implementation.
 */

// Esquema para embeddings de recursos
export interface ResourceEmbedding {
  id: string;
  resource_id: string;
  chunk_index: number;
  text: string;
  vector: number[];
  metadata: {
    resource_type: string;
    title: string;
    project_id: string;
    created_at: number;
  };
}

// Esquema para embeddings de fuentes
export interface SourceEmbedding {
  id: string;
  source_id: string;
  chunk_index: number;
  text: string;
  vector: number[];
  metadata: {
    source_type: string;
    title: string;
    authors: string;
    year: number;
    created_at: number;
  };
}

let db: any | null = null;

/**
 * Initialize vector database (stub - initialization happens in main process)
 * This function is kept for compatibility but does nothing in renderer
 */
export async function initVectorDB() {
  console.warn('⚠️ initVectorDB called in renderer - initialization happens in main process');
  // Vector DB is initialized in electron/init.cjs
  return null;
}

/**
 * Create resource embeddings table (stub - handled in main process)
 */
export async function createResourceEmbeddingsTable() {
  console.warn('⚠️ createResourceEmbeddingsTable called in renderer - handled in main process');
  // Table creation happens in electron/init.cjs
  return null;
}

/**
 * Create source embeddings table (stub - handled in main process)
 */
export async function createSourceEmbeddingsTable() {
  console.warn('⚠️ createSourceEmbeddingsTable called in renderer - handled in main process');
  // Table creation happens in electron/init.cjs
  return null;
}

/**
 * Insert resource embeddings
 */
export async function insertResourceEmbeddings(embeddings: ResourceEmbedding[]) {
  if (typeof window === 'undefined' || !window.electron) {
    throw new Error('Vector DB operations require Electron');
  }
  
  return window.electron.vector.add(embeddings);
}

/**
 * Search resource embeddings
 */
export async function searchResourceEmbeddings(
  queryVector: number[],
  limit: number = 10,
  filter?: string
) {
  if (typeof window === 'undefined' || !window.electron) {
    throw new Error('Vector DB operations require Electron');
  }
  
  return window.electron.vector.search({ vector: queryVector, limit, filter });
}

/**
 * Delete resource embeddings
 */
export async function deleteResourceEmbeddings(resourceId: string) {
  if (typeof window === 'undefined' || !window.electron) {
    throw new Error('Vector DB operations require Electron');
  }
  
  return window.electron.vector.delete(`resource_id = '${resourceId}'`);
}

/**
 * Insert source embeddings
 */
export async function insertSourceEmbeddings(embeddings: SourceEmbedding[]) {
  if (typeof window === 'undefined' || !window.electron) {
    throw new Error('Vector DB operations require Electron');
  }
  
  return window.electron.vector.add(embeddings);
}

/**
 * Search source embeddings
 */
export async function searchSourceEmbeddings(
  queryVector: number[],
  limit: number = 10,
  filter?: string
) {
  if (typeof window === 'undefined' || !window.electron) {
    throw new Error('Vector DB operations require Electron');
  }
  
  return window.electron.vector.search({ vector: queryVector, limit, filter });
}

// ============================================
// ANNOTATION EMBEDDINGS
// ============================================

export interface AnnotationEmbedding {
  id: string;
  resource_id: string;
  annotation_id: string;
  chunk_index: number;
  text: string;
  vector: number[];
  metadata: {
    annotation_type: 'highlight' | 'note';
    page_index: number;
    created_at: number;
    resource_type: 'pdf';
    title: string;
    project_id: string;
  };
}

/**
 * Index annotation in LanceDB
 */
export async function indexAnnotation(annotationData: {
  annotationId: string;
  resourceId: string;
  text: string;
  metadata: {
    annotation_type: 'highlight' | 'note';
    page_index: number;
    resource_type: 'pdf';
    title: string;
    project_id: string;
  };
}): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined' || !window.electron) {
    throw new Error('Vector DB operations require Electron');
  }

  try {
    const result = await window.electron.vector.annotations.index(annotationData);
    return result;
  } catch (error) {
    console.error('Error indexing annotation:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Search annotations in LanceDB
 */
export async function searchAnnotations(queryData: {
  queryText?: string;
  queryVector?: number[];
  limit?: number;
  resourceId?: string;
}): Promise<{
  success: boolean;
  data?: Array<{
    annotationId: string;
    resourceId: string;
    text: string;
    score: number;
    metadata: any;
  }>;
  error?: string;
}> {
  if (typeof window === 'undefined' || !window.electron) {
    throw new Error('Vector DB operations require Electron');
  }

  try {
    const result = await window.electron.vector.annotations.search(queryData);
    return result;
  } catch (error) {
    console.error('Error searching annotations:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Delete annotation from LanceDB
 */
export async function deleteAnnotationEmbedding(annotationId: string): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined' || !window.electron) {
    throw new Error('Vector DB operations require Electron');
  }

  try {
    const result = await window.electron.vector.annotations.delete(annotationId);
    return result;
  } catch (error) {
    console.error('Error deleting annotation embedding:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export { db as vectorDB };
