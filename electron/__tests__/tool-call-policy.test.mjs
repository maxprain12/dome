import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildBeforeToolCall,
  HitlInterruptError,
  MUTATION_HITL_THRESHOLDS,
  DEFAULT_GLOBAL_TOOL_CALL_LIMIT,
  DEFAULT_PER_TOOL_CAP,
} = require('../agents/agent-runtime.cjs');

function messagesWithToolCalls(name, count) {
  const calls = Array.from({ length: count }, (_, i) => ({
    type: 'toolCall',
    id: `tc_${i}`,
    name,
  }));
  return [{ role: 'assistant', content: calls }];
}

function ctxFor(name, messages = []) {
  return { toolCall: { id: 'tc_x', name, arguments: {} }, context: { messages } };
}

describe('tool-call policy (beforeToolCall)', () => {
  it('allows a normal call with empty history', async () => {
    const before = buildBeforeToolCall({});
    const res = await before(ctxFor('resource_get'));
    assert.equal(res, undefined);
  });

  it('blocks when the global per-run tool-call limit is exceeded', async () => {
    const before = buildBeforeToolCall({});
    const messages = messagesWithToolCalls('resource_get', DEFAULT_GLOBAL_TOOL_CALL_LIMIT + 1);
    const res = await before(ctxFor('resource_get', messages));
    assert.equal(res?.block, true);
    assert.match(res.reason, /global tool-call limit/);
  });

  it('applies the default per-tool cap to tools without explicit caps', async () => {
    const before = buildBeforeToolCall({});
    const messages = messagesWithToolCalls('web_search', DEFAULT_PER_TOOL_CAP + 1);
    const res = await before(ctxFor('web_search', messages));
    assert.equal(res?.block, true);
    assert.match(res.reason, /run limit/);
  });

  it('respects explicit caps from CREATION_TOOL_CAPS', async () => {
    const before = buildBeforeToolCall({});
    const messages = messagesWithToolCalls('ppt_create', 9); // cap is 8
    const res = await before(ctxFor('ppt_create', messages));
    assert.equal(res?.block, true);
    assert.match(res.reason, /run limit/);
  });

  it('blocks past-threshold mutations on unattended surfaces (no approval channel)', async () => {
    const before = buildBeforeToolCall({ skipHitl: true });
    const threshold = MUTATION_HITL_THRESHOLDS.resource_update;
    const messages = messagesWithToolCalls('resource_update', threshold);
    const res = await before(ctxFor('resource_update', messages));
    assert.equal(res?.block, true);
    assert.match(res.reason, /unattended mutation threshold/);
  });

  it('interrupts for approval past the mutation threshold when HITL is available', async () => {
    const before = buildBeforeToolCall({ hitlInterrupt: true });
    const threshold = MUTATION_HITL_THRESHOLDS.resource_update;
    const messages = messagesWithToolCalls('resource_update', threshold);
    await assert.rejects(
      () => before(ctxFor('resource_update', messages)),
      (err) => err instanceof HitlInterruptError,
    );
  });

  it('allows mutations under the threshold without approval', async () => {
    const before = buildBeforeToolCall({ hitlInterrupt: true });
    const threshold = MUTATION_HITL_THRESHOLDS.resource_update;
    const messages = messagesWithToolCalls('resource_update', threshold - 1);
    const res = await before(ctxFor('resource_update', messages));
    assert.equal(res, undefined);
  });

  it('asks via requestApproval and blocks when declined', async () => {
    const before = buildBeforeToolCall({
      requiresApproval: new Set(['resource_delete']),
      requestApproval: async () => false,
    });
    const res = await before(ctxFor('resource_delete'));
    assert.equal(res?.block, true);
    assert.match(res.reason, /declined/);
  });
});
