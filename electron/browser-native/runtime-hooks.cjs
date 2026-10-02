'use strict';
function trimHistory(messages, limit) {
  if (!limit || messages.length <= limit) return messages;
  const systems = messages.filter((message) => message.role === 'system');
  const turns = []; let turn = [];
  for (const message of messages.filter((message) => message.role !== 'system')) {
    if (message.role === 'user' && turn.length) { turns.push(turn); turn = []; }
    turn.push(message);
  }
  if (turn.length) turns.push(turn);
  const kept = []; let size = systems.length;
  for (const group of turns.reverse()) {
    if (kept.length && size + group.length > limit) break;
    kept.unshift(group); size += group.length;
  }
  return [...systems, ...kept.flat()];
}
function install(harness, config = {}) {
  let failures = 0;
  const unsubscribe = [harness.on('context', ({ messages }) => ({ messages: trimHistory(messages, config.maxHistoryItems) }))];
  unsubscribe.push(harness.on('tool_result', async (event) => {
    if (event.toolName === 'browser_done' && !event.isError) return { terminate: true };
    failures = event.isError ? failures + 1 : 0;
    if (failures <= (config.maxFailures ?? 3)) return;
    if (!config.finalResponseAfterFailure) return { terminate: true };
    // Let the same agent explain the observed failure once, with no further actions.
    await harness.setActiveTools([]);
    return { content: [...event.content, { type: 'text', text: 'The action failure budget is exhausted. Provide a final answer explaining the observed failure and any completed work.' }] };
  }));
  return () => unsubscribe.forEach((fn) => fn());
}
module.exports = { trimHistory, install };
