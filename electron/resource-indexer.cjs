/* eslint-disable no-console */
/**
 * Resource Indexer - Selective embedding for semantic search and knowledge graph
 * Only indexes resource types with indexable text content.
 */

const { chunk: llmChunk } = require('llm-chunk');

// Notebook excluded: indexing causes app crashes
const EMBEDDABLE_TYPES = ['note', 'document', 'url', 'pdf', 'video', 'audio', 'excel'];
const MIN_TEXT_LENGTH = 50;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const BATCH_SIZE = 3;
const MAX_CHUNKS_URL = 25; // Limit URL chunks to avoid OOM (~25k chars)
const MAX_CHUNKS_DEFAULT = 100;

const pending = new Map();
const inProgress = new Set();
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
 * Strip Markdown syntax to plain text (for note/document content)
 */
function stripMarkdown(md) {
  if (!md || typeof md !== 'string') return '';
  return md
    .replace(/^#{1,6}\s+/gm, '') // headers
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2') // bold
    .replace(/\*([^*]+)\*|_([^_]+)_/g, '$1$2') // italic
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/```[\s\S]*?```/g, '') // fenced code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^[-*+]\s/gm, '') // list markers
    .replace(/^\d+\.\s/gm, '') // ordered list
    .replace(/^>\s/gm, '') // blockquote
    .replace(/^---+$/gm, '') // horizontal rule
    .replace(/:::[\s\S]*?:::/g, '') // custom blocks (callout, toggle, etc.)
    .replace(/@\[[^\]]*\]\([^)]+\)/g, '') // resource mentions
    .replace(/\s+/g, ' ')
    .trim();
}

/** Regex to match [Sheet: Name] headers in Excel content */
const EXCEL_SHEET_HEADER_RE = /\[Sheet:\s*([^\]]+)\]\s*\n/g;

/**
 * Chunk Excel content by sheet blocks. Preserves logical table structure.
 * Content format from document-extractor: [Sheet: Name]\n...csv...
 * @param {string} text - Excel content with [Sheet: Name] headers
 * @returns {Array<{ text: string; sheet_name?: string }>}
 */
function chunkExcelBySheet(text) {
  if (!text || !text.trim()) return [];
  const trimmed = text.trim();
  const matches = [...trimmed.matchAll(EXCEL_SHEET_HEADER_RE)];
  if (matches.length === 0) return [{ text: trimmed }];

  const chunks = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const sheetName = match[1]?.trim() || 'Sheet1';
    const start = match.index + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : trimmed.length;
    const blockContent = trimmed.slice(start, end).trim();
    if (blockContent) {
      const fullBlock = `[Sheet: ${sheetName}]\n${blockContent}`;
      chunks.push({ text: fullBlock, sheet_name: sheetName });
    }
  }
  return chunks.length > 0 ? chunks : [{ text: trimmed }];
}

/**
 * Chunk text with overlap using llm-chunk (avoids RangeError with very long text)
 * @param {string} text - Text to chunk
 * @param {{ chunkSize?: number; chunkOverlap?: number }} options
 * @returns {Array<{ text: string }>}
 */
function chunkText(text, options = {}) {
  const chunkSize = options.chunkSize || CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap || CHUNK_OVERLAP;
  if (!text || !text.trim()) return [];
  try {
    const chunks = llmChunk(text, {
      minLength: 0,
      maxLength: chunkSize,
      overlap: chunkOverlap,
      splitter: 'paragraph',
    });
    return Array.isArray(chunks) ? chunks.map((t) => ({ text: String(t) })) : [];
  } catch (err) {
    console.warn('[Indexer] llm-chunk error:', err?.message);
    return [];
  }
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
    case 'document': {
      const raw = resource.content || '';
      if (/<[a-z][\s>]/.test(raw)) return stripHtml(raw);
      return stripMarkdown(raw);
    }
    case 'notebook':
      return notebookToText(resource.content);
    case 'url':
      return metadata.scraped_content || '';
    case 'pdf':
      return (resource.content || '').trim(); // Content has extracted text when PDF was imported
    case 'video':
    case 'audio':
      return [metadata.transcription, metadata.summary].filter(Boolean).join('\n\n');
    case 'excel':
      return (resource.content || '').trim();
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
 * Uses incremental batch writes to avoid OOM.
 */
async function indexResource(resourceId, deps) {
  if (inProgress.has(resourceId)) {
    console.log(`[Indexer] Skipping ${resourceId} - already indexing`);
    return;
  }
  inProgress.add(resourceId);
  try {
    const { database, initModule, ollamaService } = deps || {};
    if (!database || !initModule || !ollamaService) return;

    const queries = database.getQueries();
    if (!queries || !queries.getResourceByIdForIndexing) return;
    const resource = queries.getResourceByIdForIndexing.get(resourceId);
    if (!resource || !shouldIndex(resource)) return;

    const text = extractIndexableText(resource);
    if (!text || typeof text !== 'string' || !text.trim()) return;

    const vectorDB = initModule.getVectorDB();
    if (!vectorDB) {
      console.warn('[Indexer] Vector DB not available');
      return;
    }

    await deleteResourceEmbeddings(vectorDB, resourceId);

    const maxChunks = (resource.type || '').toLowerCase() === 'url' ? MAX_CHUNKS_URL : MAX_CHUNKS_DEFAULT;
    const isExcel = (resource.type || '').toLowerCase() === 'excel';

    let chunks;
    if (isExcel) {
      chunks = chunkExcelBySheet(text);
      if (chunks.length > maxChunks) chunks = chunks.slice(0, maxChunks);
    } else {
      const maxTextLength = maxChunks * (CHUNK_SIZE - CHUNK_OVERLAP) + CHUNK_OVERLAP;
      const textToChunk = text.length > maxTextLength ? text.slice(0, maxTextLength) : text;
      if (text.length > maxTextLength) {
        console.log(`[Indexer] Truncated text to ${maxTextLength} chars for ${resource.type} (was ${text.length})`);
      }
      chunks = chunkText(textToChunk);
      if (chunks.length > maxChunks) chunks = chunks.slice(0, maxChunks);
    }
    if (chunks.length === 0) return;

    const baseMetadata = {
      resource_type: resource.type,
      title: resource.title || 'Untitled',
      project_id: resource.project_id || 'default',
      created_at: Date.now(),
    };
    const getChunkMetadata = (chunk) =>
      chunk.sheet_name
        ? { ...baseMetadata, sheet_name: chunk.sheet_name }
        : baseMetadata;

    let embeddingDimension = 1024;
    const isOllamaAvailable = await ollamaService.checkAvailability();
    const aiCloudService = require('./ai-cloud-service.cjs');
    const aiApiKey = queries.getSetting.get('ai_api_key')?.value;
    const aiProvider = queries.getSetting.get('ai_provider')?.value;
    const aiEmbeddingModel = queries.getSetting.get('ai_embedding_model')?.value;
    const useCloud = !isOllamaAvailable && aiApiKey && ['openai', 'anthropic', 'google'].includes(aiProvider);
    const defaultModels = { openai: 'text-embedding-3-small', anthropic: 'voyage-multimodal-3', google: 'text-embedding-004' };
    const cloudModel = aiEmbeddingModel || defaultModels[aiProvider] || 'text-embedding-3-small';

    if (!isOllamaAvailable && !useCloud) {
      console.warn('[Indexer] No embedding provider available (Ollama offline, no cloud provider configured)');
      return;
    }

    let table = null;
    let totalIndexed = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const batchEmbeddings = [];
      if (isOllamaAvailable) {
        const ollamaBaseUrl = queries.getSetting.get('ollama_base_url');
        const ollamaEmbeddingModel = queries.getSetting.get('ollama_embedding_model');
        const baseUrl = ollamaBaseUrl?.value || ollamaService.DEFAULT_BASE_URL;
        const embeddingModel = ollamaEmbeddingModel?.value || ollamaService.DEFAULT_EMBEDDING_MODEL;
        const results = await Promise.all(
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
                  metadata: getChunkMetadata(chunk),
                };
              }
            } catch (err) {
              console.error(`[Indexer] Embedding failed for chunk ${globalIdx}:`, err.message);
            }
            return null;
          })
        );
        batchEmbeddings.push(...results.filter(Boolean));
      } else {
        try {
          const batchTexts = batch.map((c) => c.text);
          const vectors = await aiCloudService.embeddings(aiProvider, batchTexts, aiApiKey, cloudModel);
          for (let batchIdx = 0; batchIdx < batch.length; batchIdx++) {
            const vec = vectors?.[batchIdx];
            if (vec && Array.isArray(vec)) {
              embeddingDimension = vec.length;
              batchEmbeddings.push({
                id: `${resourceId}-${i + batchIdx}`,
                resource_id: resourceId,
                chunk_index: i + batchIdx,
                text: batch[batchIdx].text,
                vector: vec,
                metadata: getChunkMetadata(batch[batchIdx]),
              });
            }
          }
          if (i === 0) console.log('[Indexer] Using cloud embeddings (Ollama unavailable)');
        } catch (err) {
          console.error(`[Indexer] Cloud embedding failed for batch ${i}:`, err.message);
        }
      }

      if (batchEmbeddings.length === 0) continue;

      const tables = await vectorDB.tableNames();
      if (!table) {
        if (!tables.includes('resource_embeddings')) {
          await initModule.createResourceEmbeddingsTable(embeddingDimension);
        }
        table = await vectorDB.openTable('resource_embeddings');
      }

      try {
        await table.add(batchEmbeddings);
        totalIndexed += batchEmbeddings.length;
      } catch (addErr) {
        const msg = addErr?.message || '';
        const isSchemaError = msg.includes('vector column') || msg.includes('Schema') || msg.includes('schema') || msg.includes('dimension') || msg.includes('dictionary');
        if (isSchemaError) {
          console.warn('[Indexer] Schema/dimension mismatch, recreating resource_embeddings table...');
          await initModule.createResourceEmbeddingsTable(embeddingDimension, true);
          table = await vectorDB.openTable('resource_embeddings');
          await table.add(batchEmbeddings);
          totalIndexed += batchEmbeddings.length;
        } else {
          throw addErr;
        }
      }
    }

    if (totalIndexed > 0) {
      console.log(`[Indexer] Indexed ${totalIndexed} chunks for ${resource.type} ${resourceId}`);
    }
  } catch (err) {
    console.error('[Indexer] Error indexing resource:', err);
  } finally {
    inProgress.delete(resourceId);
  }
}

/**
 * Schedule indexing with debounce to avoid redundant work.
 * Runs in next event loop tick so callers (notes, URL workspace, etc.) return immediately
 * without blocking. Indexing happens asynchronously in background.
 */
function scheduleIndexing(resourceId, deps) {
  if (!resourceId || !deps) return;
  if (inProgress.has(resourceId)) return;
  pending.set(resourceId, deps);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const ids = Array.from(pending.keys());
    const depsForFirst = ids.length > 0 ? pending.get(ids[0]) : null;
    pending.clear();
    if (!depsForFirst) return;
    // Run indexing in setImmediate so it yields to event loop - no blocking
    setImmediate(() => {
      (async () => {
        for (const id of ids) {
          try {
            await indexResource(id, depsForFirst);
          } catch (err) {
            console.error(`[Indexer] Error indexing ${id}:`, err.message);
          }
        }
      })().catch((err) => console.error('[Indexer] Indexing loop error:', err));
    });
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
