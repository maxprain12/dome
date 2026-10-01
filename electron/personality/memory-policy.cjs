'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
const GLOBAL_KEY = 'memory_enabled';
function getQueries() {
  try { return require('../core/database.cjs').getQueries(); } catch { return null; }
}
function conversationId(options = {}) {
  return String(options.conversationId || options.parentThreadId || options.sessionId || options.threadId || '').replace(/^session_/, '');
}
function overrideKey(id) { return `memory_conversation_${id}`; }
function getMemoryPolicy(options = {}, queries = getQueries()) {
  const inherited = context.getStore() || {};
  const scope = { ...inherited, ...options, memoryEnabled: inherited.memoryEnabled !== false && options.memoryEnabled !== false };
  const id = conversationId(scope);
  const globalEnabled = !['false', '0'].includes(queries?.getSetting?.get?.(GLOBAL_KEY)?.value);
  const saved = id ? queries?.getSetting?.get?.(overrideKey(id))?.value : undefined;
  const conversationEnabled = saved !== 'false' && saved !== '0' && scope.memoryEnabled !== false;
  return { globalEnabled, conversationEnabled, enabled: globalEnabled && conversationEnabled, conversationId: id };
}
function isMemoryEnabled(options) { return getMemoryPolicy(options).enabled; }
function assertMemoryWriteAllowed(options) {
  if (!isMemoryEnabled(options)) throw new Error('Memory is disabled for this conversation');
}
function withMemoryPolicy(options, run) {
  const inherited = context.getStore() || {};
  const id = conversationId(options) || conversationId(inherited);
  return context.run({ ...inherited, ...options, conversationId: id,
    memoryEnabled: getMemoryPolicy(options).enabled }, run);
}
function setMemoryPolicy({ conversationId: id, enabled }, queries = getQueries()) {
  if (!queries) throw new Error('Memory settings are unavailable');
  queries.setSetting.run(id ? overrideKey(id) : GLOBAL_KEY, String(enabled), Date.now());
  return getMemoryPolicy({ conversationId: id }, queries);
}
module.exports = { getMemoryPolicy, isMemoryEnabled, assertMemoryWriteAllowed, withMemoryPolicy, setMemoryPolicy };
