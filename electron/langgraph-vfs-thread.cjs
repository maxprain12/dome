'use strict';

/**
 * Per–thread_id VfsSandbox instances for LangGraph runs (interrupt → resume must
 * reuse the same backend). Evicts oldest entries when the map grows past MAX.
 */

const MAX_THREADS = 16;

/** @type {Map<string, { sandbox: import('@langchain/node-vfs').VfsSandbox }>} */
const sandboxes = new Map();

function normalizeThreadId(threadId) {
  const s = threadId != null && String(threadId).trim() ? String(threadId).trim() : '_';
  return s;
}

function isVfsSandboxDisabled() {
  const v = String(process.env.DOME_LANGGRAPH_VFS_SANDBOX ?? '').toLowerCase().trim();
  return v === '0' || v === 'false' || v === 'off' || v === 'no';
}

async function evictOldestIfNeeded() {
  while (sandboxes.size >= MAX_THREADS) {
    const oldest = sandboxes.keys().next().value;
    if (oldest == null) break;
    await disposeThreadSandbox(oldest);
  }
}

/**
 * @param {string | null | undefined} threadId
 * @param {number} [timeoutMs]
 */
async function ensureThreadVfsSandbox(threadId, timeoutMs = 120_000) {
  if (isVfsSandboxDisabled()) return null;
  const tid = normalizeThreadId(threadId);
  const existing = sandboxes.get(tid);
  if (existing) return existing.sandbox;
  await evictOldestIfNeeded();
  const { VfsSandbox } = await import('@langchain/node-vfs');
  const sandbox = await VfsSandbox.create({
    timeout: Math.min(Math.max(timeoutMs, 5000), 300_000),
  });
  sandboxes.set(tid, { sandbox });
  return sandbox;
}

/**
 * Stop and drop the sandbox for this thread (call after a run completes without
 * HITL interrupt, or when replacing a stale entry).
 * @param {string | null | undefined} threadId
 */
async function disposeThreadSandbox(threadId) {
  const tid = normalizeThreadId(threadId);
  const entry = sandboxes.get(tid);
  if (!entry) return;
  sandboxes.delete(tid);
  try {
    await entry.sandbox.stop();
  } catch {
    /* ignore */
  }
}

module.exports = {
  ensureThreadVfsSandbox,
  disposeThreadSandbox,
  isVfsSandboxDisabled,
};
