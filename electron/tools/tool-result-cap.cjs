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
 * Hard ceiling (chars) on a single tool result's JSON serialization.
 *
 * The per-tool char caps above run AFTER `JSON.stringify`, so they cannot stop a
 * runaway result (e.g. an MCP filesystem read of a multi-hundred-MB file/tree, or
 * a huge unpaginated API response) from OOM-ing the MAIN process inside V8's
 * JsonStringify ("Zone" OOM — the ELECTRON-7 crash signature). This budget bounds
 * the serialization itself. 16M chars is ~32MB UTF-16 — far above any legitimate
 * capped result (<=48k) yet far below the heap limit.
 */
const SAFE_STRINGIFY_BUDGET_CHARS = 16 * 1024 * 1024;

/**
 * `JSON.stringify` that aborts early instead of letting the output grow without
 * bound. Returns the JSON string when within budget, or a small JSON notice when
 * the value is too large to serialize safely. Strings pass through untouched
 * (the caller's char cap slices them cheaply — no growth). Non-size serialization
 * errors (circular refs, BigInt, throwing toJSON) propagate unchanged so callers
 * keep their existing error handling.
 *
 * @param {unknown} value
 * @param {{ budgetChars?: number }} [opts]
 * @returns {string}
 */
function safeStringify(value, opts = {}) {
  if (typeof value === 'string') return value;
  const budget =
    typeof opts.budgetChars === 'number' && opts.budgetChars > 2000
      ? opts.budgetChars
      : SAFE_STRINGIFY_BUDGET_CHARS;
  let approx = 0;
  const ABORT = {};
  try {
    return (
      JSON.stringify(value, function (key, val) {
        approx += key.length + 2;
        const t = typeof val;
        if (t === 'string') approx += val.length + 2;
        else if (t === 'number' || t === 'boolean' || val === null) approx += 6;
        if (approx > budget) throw ABORT;
        return val;
      }) ?? ''
    );
  } catch (err) {
    if (err !== ABORT) throw err;
    const mb = Math.max(1, Math.round(budget / 1024 / 1024));
    return JSON.stringify({
      error: 'tool_result_too_large',
      message:
        `Dome: tool result exceeded the ~${mb}MB serialization limit and was dropped to protect the app ` +
        'from running out of memory. Retry with pagination, filters, or a narrower query.',
    });
  }
}

/**
 * Structured `details` budget. The agent loop persists each tool result's
 * `details` verbatim into the session JSONL (`createToolResultMessage` →
 * `appendEntry` → `JSON.stringify(entry)`). A raw MCP payload (e.g. a
 * `chrome_devtools` `take_snapshot` on a heavy page) carried as `details`
 * therefore OOMs the MAIN process at persistence time — *even when the
 * model-facing `content` text is already capped* (the ELECTRON-7 crash). 1M
 * chars (~2MB UTF-16) keeps legitimate structured details while staying far
 * below the heap limit.
 */
const DETAILS_BUDGET_CHARS = 1024 * 1024;

/**
 * Bound a tool result's `details` so it can never grow the persisted session
 * entry without limit. Returns the value untouched when it serializes within
 * budget (cheap walk that aborts early — it never builds an unbounded buffer),
 * or a tiny marker object when it is too large / unserializable. Strings within
 * budget pass through; oversized strings collapse to a marker.
 *
 * @param {unknown} value
 * @param {{ budgetChars?: number }} [opts]
 * @returns {unknown}
 */
function boundToolDetails(value, opts = {}) {
  if (value == null) return value;
  const budget =
    typeof opts.budgetChars === 'number' && opts.budgetChars > 2000
      ? opts.budgetChars
      : DETAILS_BUDGET_CHARS;
  if (typeof value === 'string') {
    return value.length <= budget
      ? value
      : { _domeOmitted: 'tool_result_too_large', approxChars: value.length };
  }
  if (typeof value !== 'object') return value;
  let approx = 0;
  const ABORT = {};
  try {
    JSON.stringify(value, function (key, val) {
      approx += key.length + 2;
      const t = typeof val;
      if (t === 'string') approx += val.length + 2;
      else if (t === 'number' || t === 'boolean' || val === null) approx += 6;
      if (approx > budget) throw ABORT;
      return val;
    });
    return value;
  } catch (err) {
    if (err === ABORT) return { _domeOmitted: 'tool_result_too_large' };
    return { _domeOmitted: 'tool_result_unserializable' };
  }
}

/**
 * Per-tool-call result budget for *persistence* (run metadata, run steps,
 * chat_messages). This is independent of what the model sees: the harness
 * already delivered the full (or harness-capped) result to the model during the
 * run. We only bound the copy we WRITE TO SQLITE so it can neither (a) bloat the
 * DB with multi-MB rows that pile up as unreclaimable free pages, nor (b) make a
 * later `JSON.stringify(metadata.toolCalls)` OOM the main process (ELECTRON-7).
 * 64k chars (~128KB UTF-16) is a generous human-readable preview yet keeps even
 * a long run's aggregated toolCalls comfortably small.
 */
const PERSIST_RESULT_BUDGET_CHARS = 64 * 1024;

/**
 * Bound a tool result for persistence, ALWAYS returning a string no larger than
 * roughly `budgetChars`. Unlike `safeStringify` (which passes strings through
 * untouched — the exact gap that left 9MB strings in the DB), this also slices
 * oversized *strings*. Objects are serialized within budget first; anything that
 * still overflows is sliced with a truncation marker.
 *
 * @param {unknown} value
 * @param {{ budgetChars?: number }} [opts]
 * @returns {string | null | undefined}
 */
function capResultText(value, opts = {}) {
  if (value == null) return value;
  const budget =
    typeof opts.budgetChars === 'number' && opts.budgetChars > 2000
      ? opts.budgetChars
      : PERSIST_RESULT_BUDGET_CHARS;
  const text = typeof value === 'string' ? value : safeStringify(value, { budgetChars: budget });
  if (typeof text !== 'string' || text.length <= budget) return text;
  const head = Math.floor(budget * 0.5);
  return (
    `${text.slice(0, head)}\n\n` +
    `[Dome: result truncated for storage — ${text.length} chars → ~${head} kept. ` +
    'The full result was delivered to the model during the run.]'
  );
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
  capResultText,
  safeStringify,
  boundToolDetails,
  getCapForTool,
  DEFAULT_MAX_CHARS,
  SAFE_STRINGIFY_BUDGET_CHARS,
  DETAILS_BUDGET_CHARS,
  PERSIST_RESULT_BUDGET_CHARS,
  TOOL_RESULT_CAPS,
  DIRECTORY_TREE_HINT,
};
