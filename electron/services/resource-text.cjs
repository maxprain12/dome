'use strict';

const { getResolvedStateForArtifactRow } = require('../artifact-serialize.cjs');

/** Max length stored in `resources.content` for FTS (artifacts only; keeps SQLite rows reasonable). */
const ARTIFACT_FTS_CONTENT_CAP = 200_000;

/**
 * @typedef {{ text: string, source: 'content' | 'empty' }} IndexableText
 */

/** Block nodes where we append a trailing newline after processing children (TipTap / ProseMirror). */
const PM_BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'listItem',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'horizontalRule',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
]);

/**
 * Extract plain text from a TipTap / ProseMirror JSON doc (iterative, no recursion).
 * @param {Record<string, unknown>} docRoot
 * @returns {string}
 */
function extractPlainTextFromProseMirror(docRoot) {
  if (!docRoot || typeof docRoot !== 'object') return '';
  const parts = [];
  const root = /** @type {Record<string, unknown>} */ (docRoot);
  const top = root.type === 'doc' && Array.isArray(root.content) ? root.content : [docRoot];
  /** @type {Array<{ t: 'node' | 'end'; n?: Record<string, unknown> }>} */
  const stack = [];
  const pushNode = (n) => stack.push({ t: 'node', n });
  const pushEnd = (n) => stack.push({ t: 'end', n });
  for (let i = top.length - 1; i >= 0; i--) {
    pushNode(/** @type {Record<string, unknown>} */ (top[i]));
  }

  while (stack.length) {
    const item = stack.pop();
    if (!item) continue;
    if (item.t === 'end') {
      const n = item.n;
      if (n && PM_BLOCK_TYPES.has(String(n.type))) {
        parts.push('\n');
      }
      continue;
    }
    const node = item.n;
    if (!node || typeof node !== 'object') continue;
    if (typeof node.text === 'string') parts.push(node.text);
    if (node.type === 'hardBreak') parts.push('\n');
    const ch = node.content;
    if (Array.isArray(ch) && ch.length > 0) {
      pushEnd(node);
      for (let i = ch.length - 1; i >= 0; i--) {
        const c = ch[i];
        if (c && typeof c === 'object') pushNode(/** @type {Record<string, unknown>} */ (c));
      }
    } else if (PM_BLOCK_TYPES.has(String(node.type))) {
      parts.push('\n');
    }
  }
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Strip minimal HTML / tags for note body.
 * @param {string} html
 */
function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Plain-text + structured payload for semantic index and FTS (artifact resources).
 * @param {Record<string, unknown>} row resource row
 * @param {unknown} queries database.getQueries() or null
 * @returns {IndexableText}
 */
function buildArtifactIndexPayload(row, queries) {
  const title = String(row.title || '').trim();
  const id = String(row.id || '');
  if (!queries || typeof queries.getArtifactByResourceId?.get !== 'function' || !id) {
    return title ? { text: title, source: 'content' } : { text: '', source: 'empty' };
  }
  const art = queries.getArtifactByResourceId.get(id);
  if (!art) {
    return title ? { text: title, source: 'content' } : { text: '', source: 'empty' };
  }
  const state = getResolvedStateForArtifactRow(queries, art);
  const html = typeof state.html === 'string' ? state.html : '';
  const htmlText = stripTags(html);
  let dataStr = '';
  if (state.data !== undefined && state.data !== null) {
    try {
      dataStr = typeof state.data === 'string' ? state.data : JSON.stringify(state.data);
    } catch {
      dataStr = String(state.data);
    }
  }
  const metaBlock = [
    title,
    `artifact_type:${String(art.artifact_type || '')}`,
    art.template ? `template:${String(art.template)}` : '',
    art.linked_resource_id ? `linked_resource_id:${art.linked_resource_id}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const parts = [
    metaBlock,
    htmlText ? `html_text:\n${htmlText}` : '',
    dataStr ? `structured_data:\n${dataStr}` : '',
  ].filter(Boolean);
  const text = parts.join('\n\n').trim();
  if (!text) return { text: '', source: 'empty' };
  return { text, source: 'content' };
}

/**
 * Denormalize search text into `resources.content` so `resources_fts` triggers index titles + body.
 * Safe for type `artifact` only.
 * @param {Record<string, import('better-sqlite3').Statement>} queries
 * @param {string} resourceId
 */
function syncArtifactFtsContent(queries, resourceId) {
  if (!resourceId || !queries?.getResourceById?.get || !queries.updateResourceContent?.run) return;
  const row = queries.getResourceById.get(resourceId);
  if (!row || String(row.type) !== 'artifact') return;
  const { text } = buildArtifactIndexPayload(row, queries);
  const payload =
    text.length > ARTIFACT_FTS_CONTENT_CAP ? text.slice(0, ARTIFACT_FTS_CONTENT_CAP) : text;
  queries.updateResourceContent.run(payload, Date.now(), resourceId);
}

function getIndexableText(row, queries) {
  const type = String(row.type || '');
  const title = String(row.title || '').trim();

  if (type === 'artifact') {
    return buildArtifactIndexPayload(row, queries);
  }

  if (type === 'note') {
    const raw = String(row.content || '');
    let body = '';
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (
          parsed &&
          typeof parsed === 'object' &&
          parsed.type === 'doc' &&
          Array.isArray(parsed.content)
        ) {
          body = extractPlainTextFromProseMirror(/** @type {Record<string, unknown>} */ (parsed));
        }
      } catch {
        /* fall through to stripTags */
      }
    }
    if (!body) {
      body = stripTags(raw);
    }
    const text = [title, body].filter(Boolean).join('\n').trim();
    if (!text) {
      return { text: '', source: 'empty' };
    }
    return { text, source: 'content' };
  }

  const useContentTypes = ['pdf', 'document', 'url', 'notebook', 'ppt', 'excel'];
  if (useContentTypes.includes(type)) {
    const content = String(row.content || '').trim();
    const text = [title, stripTags(content)].filter(Boolean).join('\n').trim();
    if (!text) {
      return { text: '', source: 'empty' };
    }
    return { text, source: 'content' };
  }

  return { text: '', source: 'empty' };
}

module.exports = {
  getIndexableText,
  buildArtifactIndexPayload,
  syncArtifactFtsContent,
  ARTIFACT_FTS_CONTENT_CAP,
  stripTags,
  extractPlainTextFromProseMirror,
};
