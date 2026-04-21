'use strict';

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
 * @param {Record<string, unknown>} row resource row
 * @param {unknown} [_queries] unused — kept for API compatibility
 * @returns {IndexableText}
 */
function getIndexableText(row, _queries) {
  const type = String(row.type || '');
  const title = String(row.title || '').trim();

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
  stripTags,
  extractPlainTextFromProseMirror,
};
