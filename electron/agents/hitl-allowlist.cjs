'use strict';

/**
 * Thread-scoped HITL auto-approve allowlist.
 * Set when the user chooses "Accept all" — subsequent HITL tools (and shell_exec)
 * on the same threadId skip approval until cleared.
 */

/** @type {Map<string, Set<string>>} */
const allowByThread = new Map();

const ALL_TOKEN = '*';

function normalizeThreadId(threadId) {
  if (threadId == null) return null;
  const s = String(threadId).trim();
  return s || null;
}

/**
 * @param {string|null|undefined} threadId
 * @param {string[]|'*'} [tools] tool names, or '*' for all HITL tools
 */
function approveAllForThread(threadId, tools = ALL_TOKEN) {
  const id = normalizeThreadId(threadId);
  if (!id) return;
  let set = allowByThread.get(id);
  if (!set) {
    set = new Set();
    allowByThread.set(id, set);
  }
  if (tools === ALL_TOKEN || tools === '*') {
    set.add(ALL_TOKEN);
    return;
  }
  if (Array.isArray(tools)) {
    for (const t of tools) {
      if (typeof t === 'string' && t.trim()) set.add(t.trim());
    }
  }
}

/**
 * @param {string|null|undefined} threadId
 * @param {string} toolName
 */
function isToolAutoApproved(threadId, toolName) {
  const id = normalizeThreadId(threadId);
  if (!id || !toolName) return false;
  const set = allowByThread.get(id);
  if (!set || set.size === 0) return false;
  if (set.has(ALL_TOKEN)) return true;
  return set.has(String(toolName).trim());
}

/**
 * @param {string|null|undefined} threadId
 */
function clearThread(threadId) {
  const id = normalizeThreadId(threadId);
  if (!id) return;
  allowByThread.delete(id);
}

function clearAll() {
  allowByThread.clear();
}

module.exports = {
  approveAllForThread,
  isToolAutoApproved,
  clearThread,
  clearAll,
  ALL_TOKEN,
};
