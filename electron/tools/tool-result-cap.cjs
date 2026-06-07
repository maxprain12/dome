'use strict';

/** ~12k tokens at chars/4 — keeps tool-heavy turns inside rough budgets before trim. */
const DEFAULT_MAX_CHARS = 48_000;

/** Per-tool caps (MCP filesystem tools can return huge payloads). */
const TOOL_RESULT_CAPS = {
  directory_tree: 12_000,
  list_directory_with_sizes: 24_000,
  search_files: 32_000,
  file_tree: 32_000,
};

const DIRECTORY_TREE_HINT =
  'Prefer Dome native file_list (one level), file_tree (bounded depth), or file_search (pattern). ' +
  'Never scan project root, home, or drive roots with directory_tree.';

/**
 * @param {string} toolName
 * @returns {number}
 */
function getCapForTool(toolName) {
  const key = String(toolName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const cap = TOOL_RESULT_CAPS[key];
  return typeof cap === 'number' && cap > 2000 ? cap : DEFAULT_MAX_CHARS;
}

/**
 * @param {string} toolName
 * @param {number} originalLen
 * @param {number} headLen
 * @returns {string}
 */
function buildTruncateSuffix(toolName, originalLen, headLen) {
  const norm = String(toolName || '').toLowerCase();
  const base =
    `[Dome: tool result truncated — ${originalLen} chars → ~${headLen} shown. Tool: ${toolName}. ` +
    'Use smaller pages/batches, filters, or follow-up calls to retrieve the rest.';
  if (norm.includes('directory_tree')) {
    return `${base} ${DIRECTORY_TREE_HINT}]`;
  }
  return `${base}]`;
}

/**
 * @param {string} toolName
 * @param {string} text
 * @param {{ maxChars?: number }} [opts]
 * @returns {string}
 */
function capToolResultString(toolName, text, opts = {}) {
  const maxChars =
    typeof opts.maxChars === 'number' && opts.maxChars > 2000
      ? opts.maxChars
      : getCapForTool(toolName);
  const s = typeof text === 'string' ? text : String(text ?? '');
  if (s.length <= maxChars) return s;
  const head = Math.floor(maxChars * 0.5);
  return `${s.slice(0, head)}\n\n${buildTruncateSuffix(toolName, s.length, head)}`;
}

module.exports = {
  capToolResultString,
  getCapForTool,
  DEFAULT_MAX_CHARS,
  TOOL_RESULT_CAPS,
  DIRECTORY_TREE_HINT,
};
