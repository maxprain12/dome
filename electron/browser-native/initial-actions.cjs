'use strict';
const { randomUUID } = require('node:crypto');

async function initialActions(setup, opts, beforeToolCall) {
  const entries = opts.localRuntimeOptions?.initialActions || [];
  for (const entry of entries) {
    const tool = setup.tools.find((candidate) => candidate.name === entry.name);
    if (!tool) throw new Error(`Initial action is not enabled: ${entry.name}`);
    const call = { type: 'toolCall', id: randomUUID(), name: entry.name, arguments: entry.args };
    await setup.session.appendMessage({ role: 'assistant', content: [call], api: setup.resolvedModel.api,
      provider: setup.resolvedModel.provider, model: setup.resolvedModel.id, stopReason: 'toolUse', timestamp: Date.now(),
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
    const decision = await beforeToolCall({ toolCall: call, messages: (await setup.session.buildContext()).messages });
    if (decision?.block) throw new Error(decision.reason);
    const { validateToolArguments } = await import('@dome/ai');
    const args = validateToolArguments(tool, call);
    const result = await tool.execute(call.id, args, opts.signal);
    if (result.isError) throw new Error(`Initial action failed: ${entry.name}`);
    await setup.session.appendMessage({ role: 'toolResult', toolCallId: call.id, toolName: call.name, content: result.content,
      isError: false, timestamp: Date.now() });
  }
}
module.exports = { initialActions };
