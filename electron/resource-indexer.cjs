/* eslint-disable no-console */
/**
 * Resource Indexer - Main Process
 *
 * Schedules and coordinates document indexing using the native JS DocIndexer.
 * No Python dependency — uses pdfjs-dist and the configured AI provider directly.
 *
 * Full-text search continues via SQLite FTS5 triggers (automatic).
 *
 * Supported types:
 *   pdf  → extracts text with pdfjs-dist, summarizes chunks with LLM
 *   note → parses markdown headers, builds section tree (no LLM needed)
 */

const docIndexer = require('./doc-indexer.cjs');

const pending = new Map();
let debounceTimer = null;
const DEBOUNCE_MS = 2000;

/**
 * Check if a resource type should be indexed.
 */
function shouldIndex(resource) {
  if (!resource || !resource.type) return false;
  return resource.type === 'pdf' || resource.type === 'note';
}

/**
 * Convert a Tiptap JSON document to plain markdown.
 * @param {string|object} content
 * @returns {string}
 */
function tiptapToMarkdown(content) {
  if (!content) return '';
  let doc;
  try {
    doc = typeof content === 'string' ? JSON.parse(content) : content;
  } catch {
    return typeof content === 'string' ? content : '';
  }
  if (!doc || doc.type !== 'doc') {
    return typeof content === 'string' ? content : '';
  }

  function nodeToMd(node) {
    if (!node) return '';
    const children = () => (node.content || []).map(nodeToMd).join('');
    switch (node.type) {
      case 'doc':          return (node.content || []).map(nodeToMd).join('\n\n');
      case 'heading':      return '#'.repeat(node.attrs?.level || 1) + ' ' + children();
      case 'paragraph':    return children() || '';
      case 'text':         return node.text || '';
      case 'hardBreak':    return '\n';
      case 'bulletList':   return (node.content || []).map(n => '- ' + nodeToMd(n)).join('\n');
      case 'orderedList':  return (node.content || []).map((n, i) => `${i + 1}. ` + nodeToMd(n)).join('\n');
      case 'listItem':     return (node.content || []).map(nodeToMd).join('');
      case 'blockquote':   return (node.content || []).map(n => '> ' + nodeToMd(n)).join('\n');
      case 'codeBlock':    return '```\n' + children() + '\n```';
      case 'horizontalRule': return '---';
      default:             return children();
    }
  }

  return nodeToMd(doc);
}

/**
 * Schedule indexing for a resource with debounce.
 * deps must include: { database, fileStorage, windowManager }
 */
function scheduleIndexing(resourceId, deps) {
  if (!resourceId || !deps) return;
  pending.set(resourceId, deps);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const ids = Array.from(pending.keys());
    // Snapshot deps from the last entry (they're the same object in practice)
    const lastDeps = pending.get(ids[ids.length - 1]);
    pending.clear();

    setImmediate(() => {
      (async () => {
        for (const id of ids) {
          try {
            await indexResource(id, lastDeps);
          } catch (err) {
            console.error(`[Indexer] Error indexing ${id}:`, err.message);
          }
        }
      })().catch((err) => console.error('[Indexer] Indexing loop error:', err));
    });
  }, DEBOUNCE_MS);
}

/**
 * Index a single resource using native DocIndexer.
 */
async function indexResource(resourceId, deps) {
  try {
    const { database, fileStorage, windowManager } = deps || {};
    if (!database) return;

    const queries = database.getQueries();
    if (!queries) return;

    const resource = queries.getResourceById?.get(resourceId);
    if (!resource || !shouldIndex(resource)) return;

    // Skip if already processing
    if (docIndexer.isProcessing(resourceId)) {
      console.log(`[Indexer] Already processing ${resourceId}, skipping`);
      return;
    }

    const settingRow = queries.getSetting?.get('ai_model');
    const modelUsed = settingRow?.value || 'unknown';
    const indexerDeps = { database, windowManager, title: resource.title || '' };

    let result;

    if (resource.type === 'pdf') {
      if (!fileStorage) return;
      const internalPath = resource.internal_path;
      if (!internalPath) return;
      const fs = require('fs');
      const fullPath = fileStorage.getFullPath(internalPath);
      if (!fullPath || !fs.existsSync(fullPath)) {
        console.warn(`[Indexer] PDF file not found for resource ${resourceId}`);
        return;
      }
      console.log(`[Indexer] Starting PDF indexing for ${resourceId}`);
      result = await docIndexer.indexPDF(resourceId, fullPath, indexerDeps);

    } else if (resource.type === 'note') {
      const rawContent = resource.content;
      if (!rawContent) return;
      const markdown = tiptapToMarkdown(rawContent);
      if (!markdown.trim()) return;
      console.log(`[Indexer] Starting note indexing for ${resourceId}`);
      result = await docIndexer.indexMarkdown(resourceId, markdown, resource.title || '', indexerDeps);
    }

    if (result?.success && result.tree_json) {
      queries.upsertPageIndex.run(resourceId, result.tree_json, Date.now(), modelUsed);
      // Clear transient status row (tree is now in resource_page_index with status=done)
      queries.deletePageIndexStatus?.run(resourceId);
      console.log(`[Indexer] Tree saved for ${resource.type} resource ${resourceId}`);
    } else if (result) {
      console.warn(`[Indexer] Indexing failed for ${resourceId}:`, result.error);
    }
  } catch (err) {
    console.error('[Indexer] indexResource error:', err.message);
  }
}

/**
 * Delete index for a resource (call when resource is deleted).
 */
async function deleteEmbeddings(resourceId, deps) {
  try {
    if (!resourceId || !deps) return;
    const { database } = deps;
    if (!database) return;
    const queries = database.getQueries();
    if (!queries) return;
    queries.deletePageIndex?.run(resourceId);
    queries.deletePageIndexStatus?.run(resourceId);
    console.log(`[Indexer] Index deleted for resource ${resourceId}`);
  } catch (err) {
    console.warn('[Indexer] deleteEmbeddings error:', err.message);
  }
}

/** @returns {string} */
function extractIndexableText() { return ''; }

module.exports = {
  shouldIndex,
  scheduleIndexing,
  deleteEmbeddings,
  extractIndexableText,
  tiptapToMarkdown,
};
