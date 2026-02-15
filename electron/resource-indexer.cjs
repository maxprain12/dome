/* eslint-disable no-console */
/**
 * Resource Indexer - Selective embedding for semantic search and knowledge graph
 * Only indexes resource types with indexable text content.
 */

// Notebook excluded: indexing causes app crashes
const EMBEDDABLE_TYPES = ['note', 'document', 'url', 'pdf', 'video', 'audio'];
const MIN_TEXT_LENGTH = 50;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const BATCH_SIZE = 5;

const pending = new Map();
let debounceTimer = null;
const DEBOUNCE_MS = 2000;

/**
 * Strip HTML tags to plain text
 */
function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chunk text with overlap (mirrors app/lib/search/chunking.ts)
 */
function chunkText(text, options = {}) {
  const chunkSize = options.chunkSize || CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap || CHUNK_OVERLAP;
  const separators = options.separators || ['\n\n', '\n', ' ', ''];
  const chunks = [];

  if (!text || !text.trim()) return chunks;

  let startIndex = 0;
  while (startIndex < text.length) {
    let endIndex = Math.min(startIndex + chunkSize, text.length);

    if (endIndex < text.length) {
      let splitFound = false;
      for (const sep of separators) {
        const lastIdx = text.lastIndexOf(sep, endIndex);
        if (lastIdx > startIndex) {
          endIndex = lastIdx + sep.length;
          splitFound = true;
          break;
        }
      }
    }

    chunks.push({ text: text.slice(startIndex, endIndex), startIndex, endIndex });
    startIndex = endIndex - chunkOverlap;
    if (startIndex >= endIndex) startIndex = endIndex;
  }

  return chunks;
}

/**
 * Extract indexable text from notebook JSON (markdown cells + optional code)
 */
function notebookToText(content) {
  if (!content) return '';
  try {
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    const cells = Array.isArray(parsed?.cells) ? parsed.cells : [];
    const parts = [];
    for (const cell of cells) {
      if (!cell || typeof cell !== 'object') continue;
      const type = cell.cell_type;
      const source = cell.source;
      if (source == null) continue;
      const text = Array.isArray(source) ? source.join('') : String(source);
      if (type === 'markdown') {
        parts.push(text);
      } else if (type === 'code' && text.trim().length > 0) {
        parts.push(text);
      }
    }
    return parts.join('\n\n');
  } catch {
    return '';
  }
}

/**
 * Extract indexable text from resource based on type
 */
function extractIndexableText(resource) {
  try {
    const type = (resource?.type || '').toLowerCase();
    let metadata = {};
    if (resource?.metadata) {
      try {
        metadata = typeof resource.metadata === 'string'
          ? JSON.parse(resource.metadata || '{}')
          : (resource.metadata || {});
      } catch {
        metadata = {};
      }
    }

    switch (type) {
    case 'note':
    case 'document':
      return stripHtml(resource.content || '');
    case 'notebook':
      return notebookToText(resource.content);
    case 'url':
      return [metadata.scraped_content, metadata.summary].filter(Boolean).join('\n\n');
    case 'pdf':
      return (resource.content || '').trim(); // Content has extracted text when PDF was imported
    case 'video':
    case 'audio':
      return [metadata.transcription, metadata.summary].filter(Boolean).join('\n\n');
    default:
      return '';
    }
  } catch (err) {
    console.warn('[Indexer] extractIndexableText error:', err.message);
    return '';
  }
}

/**
 * Check if resource should be indexed (never throws)
 */
function shouldIndex(resource) {
  try {
    if (!resource || !resource.id) return false;
    const type = (resource?.type || '').toLowerCase();
    if (!EMBEDDABLE_TYPES.includes(type)) return false;
    const text = extractIndexableText(resource);
    return typeof text === 'string' && text.trim().length >= MIN_TEXT_LENGTH;
  } catch (err) {
    console.warn('[Indexer] shouldIndex error:', err.message);
    return false;
  }
}

/**
 * Delete existing embeddings for a resource before re-indexing
 */
async function deleteResourceEmbeddings(vectorDB, resourceId) {
  try {
    const tables = await vectorDB.tableNames();
    if (!tables.includes('resource_embeddings')) return;
    const table = await vectorDB.openTable('resource_embeddings');
    const safeId = String(resourceId).replace(/"/g, '""');
    await table.delete(`resource_id = "${safeId}"`);
    console.log(`[Indexer] Deleted embeddings for resource ${resourceId}`);
  } catch (err) {
    console.warn('[Indexer] Could not delete existing embeddings:', err.message);
  }
}

/**
 * Index a single resource (extract text, chunk, embed, add to LanceDB)
 */
async function indexResource(resourceId, deps) {
  try {
    const { database, initModule, ollamaService } = deps || {};
    if (!database || !initModule || !ollamaService) return;

    const queries = database.getQueries();
    if (!queries || !queries.getResourceById) return;
    const resource = queries.getResourceById.get(resourceId);
    if (!resource || !shouldIndex(resource)) return;

    const text = extractIndexableText(resource);
    if (!text || typeof text !== 'string' || !text.trim()) return;

    const vectorDB = initModule.getVectorDB();
    if (!vectorDB) {
      console.warn('[Indexer] Vector DB not available');
      return;
    }

    await deleteResourceEmbeddings(vectorDB, resourceId);

    const chunks = chunkText(text);
    if (chunks.length === 0) return;

    const metadata = {
      resource_type: resource.type,
      title: resource.title || 'Untitled',
      project_id: resource.project_id || 'default',
      created_at: Date.now(),
    };

    let embeddingDimension = 1024;
    const isAvailable = await ollamaService.checkAvailability();
    if (!isAvailable) {
      console.warn('[Indexer] Ollama not available, skipping embedding');
      return;
    }

    const ollamaBaseUrl = queries.getSetting.get('ollama_base_url');
    const ollamaEmbeddingModel = queries.getSetting.get('ollama_embedding_model');
    const baseUrl = ollamaBaseUrl?.value || ollamaService.DEFAULT_BASE_URL;
    const embeddingModel = ollamaEmbeddingModel?.value || ollamaService.DEFAULT_EMBEDDING_MODEL;

    const embeddings = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const batchEmbeddings = await Promise.all(
        batch.map(async (chunk, batchIdx) => {
          const globalIdx = i + batchIdx;
          try {
            const vec = await ollamaService.generateEmbedding(chunk.text, embeddingModel, baseUrl);
            if (vec && Array.isArray(vec)) {
              embeddingDimension = vec.length;
              return {
                id: `${resourceId}-${globalIdx}`,
                resource_id: resourceId,
                chunk_index: globalIdx,
                text: chunk.text,
                vector: vec,
                metadata,
              };
            }
          } catch (err) {
            console.error(`[Indexer] Embedding failed for chunk ${globalIdx}:`, err.message);
          }
          return null;
        })
      );
      embeddings.push(...batchEmbeddings.filter(Boolean));
    }

    if (embeddings.length === 0) return;

    const tables = await vectorDB.tableNames();
    let table;
    if (tables.includes('resource_embeddings')) {
      table = await vectorDB.openTable('resource_embeddings');
    } else {
      await initModule.createResourceEmbeddingsTable(embeddingDimension);
      table = await vectorDB.openTable('resource_embeddings');
    }

    await table.add(embeddings);
    console.log(`[Indexer] Indexed ${embeddings.length} chunks for ${resource.type} ${resourceId}`);
  } catch (err) {
    console.error('[Indexer] Error indexing resource:', err);
  }
}

/**
 * Schedule indexing with debounce to avoid redundant work
 */
function scheduleIndexing(resourceId, deps) {
  if (!resourceId || !deps) return;
  pending.set(resourceId, deps);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    const ids = Array.from(pending.keys());
    const depsForFirst = ids.length > 0 ? pending.get(ids[0]) : null;
    pending.clear();
    if (!depsForFirst) return;
    for (const id of ids) {
      try {
        await indexResource(id, depsForFirst);
      } catch (err) {
        console.error(`[Indexer] Error indexing ${id}:`, err.message);
      }
    }
  }, DEBOUNCE_MS);
}

/**
 * Delete embeddings for a resource (call when resource is deleted)
 */
async function deleteEmbeddings(resourceId, deps) {
  try {
    if (!resourceId || !deps) return;
    const { initModule } = deps;
    if (!initModule || typeof initModule.getVectorDB !== 'function') return;
    const vectorDB = initModule.getVectorDB();
    if (!vectorDB) return;
    await deleteResourceEmbeddings(vectorDB, resourceId);
  } catch (err) {
    console.warn('[Indexer] deleteEmbeddings error:', err.message);
  }
}

module.exports = {
  shouldIndex,
  scheduleIndexing,
  deleteEmbeddings,
  extractIndexableText,
};
