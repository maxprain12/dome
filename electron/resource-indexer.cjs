/* eslint-disable no-console */
/**
 * Resource Indexer - Main Process
 *
 * Schedules and coordinates document indexing using the Python-backed PageIndex runner.
 * Falls back to the native JS DocIndexer if Python/PageIndex is unavailable.
 *
 * Full-text search continues via SQLite FTS5 triggers (automatic).
 *
 * Supported types:
 *   pdf       → delegates tree generation to PageIndex Python
 *   note      → converts Tiptap to markdown, then delegates to PageIndex Python
 *   document  → indexes extracted text content when available
 *   url       → indexes processed article/page content
 *   notebook  → indexes markdown/code cells as structured text
 */

const pageIndexRuntime = require('./pageindex-python.cjs');
const doclingPipeline = require('./docling-pipeline.cjs');

const pending = new Map();
let debounceTimer = null;
const DEBOUNCE_MS = 2000;

/**
 * Check if a resource type should be indexed.
 */
function shouldIndex(resource) {
  if (!resource || !resource.type) return false;
  return ['pdf', 'note', 'document', 'url', 'notebook'].includes(resource.type);
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
 * Index a single resource using the PageIndex runtime.
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
    if (pageIndexRuntime.isProcessing(resourceId)) {
      console.log(`[Indexer] Already processing ${resourceId}, skipping`);
      return;
    }

    if (resource.type === 'pdf' && !fileStorage) return;
    if (resource.type === 'pdf' && !resource.internal_path) return;
    if (resource.type !== 'pdf' && !resource.content && resource.type !== 'document') return;

    // When provider=dome and PDF has no content, convert via Docling first
    if (resource.type === 'pdf' && doclingPipeline.shouldRunDoclingForPdf(resource, database)) {
      console.log(`[Indexer] Converting PDF ${resourceId} via Docling before indexing`);
      const convertResult = await doclingPipeline.convertAndUpdateResource(
        resourceId,
        { database, fileStorage, windowManager },
        {
          onProgress: (status, progress) => {
            if (windowManager) {
              windowManager.broadcast('docling:progress', { resourceId, status, progress });
            }
          },
        }
      );
      if (!convertResult.success) {
        console.warn(`[Indexer] Docling conversion failed for ${resourceId}:`, convertResult.error);
        return;
      }
      // Resource now has markdown content; re-fetch for pageIndexRuntime
      const updated = queries.getResourceById?.get(resourceId);
      if (updated) Object.assign(resource, updated);
    }

    console.log(`[Indexer] Starting ${resource.type} indexing for ${resourceId}`);
    const result = await pageIndexRuntime.indexResource(resourceId, { database, windowManager, fileStorage });

    if (result?.success) {
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

/**
 * Index all resources that don't have an existing page index entry.
 * Safe to call multiple times — skips resources already being processed.
 * @param {{ database, fileStorage, windowManager }} deps
 */
async function indexMissingResources(deps) {
  const { database } = deps || {};
  if (!database) return;
  const db = database.getDB ? database.getDB() : null;
  if (!db) return;

  const TYPES = ['pdf', 'note', 'document', 'url', 'notebook'];
  let resources;
  try {
    resources = db.prepare(
      `SELECT r.id, r.type, r.internal_path, r.content, r.title
       FROM resources r
       LEFT JOIN resource_page_index pi ON r.id = pi.resource_id
       WHERE r.type IN (${TYPES.map((t) => `'${t}'`).join(',')}) AND pi.resource_id IS NULL`
    ).all();
  } catch (err) {
    console.error('[AutoIndex] DB query failed:', err.message);
    return;
  }

  if (resources.length === 0) return;
  console.log(`[AutoIndex] Found ${resources.length} unindexed resource(s)`);

  for (const res of resources) {
    if (!pageIndexRuntime.isProcessing(res.id)) {
      await indexResource(res.id, deps).catch((err) =>
        console.error(`[AutoIndex] Error indexing ${res.id}:`, err.message)
      );
    }
  }
}

/**
 * Schedule periodic auto-indexing: once on startup (15s delay) and every hour.
 * @param {{ database, fileStorage, windowManager }} deps
 */
function startAutoIndexing(deps) {
  // Startup: delay 15s so the app finishes initializing
  setTimeout(() => {
    indexMissingResources(deps).catch((err) =>
      console.error('[AutoIndex] Startup sweep failed:', err.message)
    );
  }, 15_000);

  // Hourly sweep
  setInterval(() => {
    indexMissingResources(deps).catch((err) =>
      console.error('[AutoIndex] Hourly sweep failed:', err.message)
    );
  }, 60 * 60 * 1_000);

  console.log('[AutoIndex] Periodic indexing scheduled (startup +15s, then every 1h)');
}

module.exports = {
  shouldIndex,
  scheduleIndexing,
  deleteEmbeddings,
  extractIndexableText,
  tiptapToMarkdown,
  indexMissingResources,
  startAutoIndexing,
};
