'use strict';

/** ~12k tokens at chars/4 — keeps tool-heavy turns inside rough budgets before trim. */
const DEFAULT_MAX_CHARS = 48_000;

/**
 * @param {string} toolName
 * @param {string} text
 * @param {{ maxChars?: number }} [opts]
 * @returns {string}
 */
function capToolResultString(toolName, text, opts = {}) {
  const maxChars = typeof opts.maxChars === 'number' && opts.maxChars > 2000 ? opts.maxChars : DEFAULT_MAX_CHARS;
  const s = typeof text === 'string' ? text : String(text ?? '');
  if (s.length <= maxChars) return s;
  const head = Math.floor(maxChars * 0.5);
  return (
    `${s.slice(0, head)}\n\n` +
    `[Dome: tool result truncated — ${s.length} chars → ~${head} shown. Tool: ${toolName}. ` +
    `Use smaller pages/batches, filters, or follow-up calls to retrieve the rest.]`
  );
}

module.exports = { capToolResultString, DEFAULT_MAX_CHARS };
