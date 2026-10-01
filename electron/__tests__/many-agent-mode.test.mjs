import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseManyAgentMode,
  filterToolDefinitionsForMode,
  extraHitlToolNames,
  applyAgentModeToMessages,
} = require('../agents/many-agent-mode.cjs');

describe('many-agent-mode', () => {
  it('filters write tools in plan mode', () => {
    const defs = [
      { function: { name: 'resource_search' } },
      { function: { name: 'resource_create' } },
      { name: 'web_search' },
    ];
    const filtered = filterToolDefinitionsForMode(defs, 'plan');
    assert.deepEqual(
      filtered.map((row) => row.function?.name || row.name),
      ['resource_search', 'web_search', 'questionnaire'],
    );
  });

  it('adds draft HITL names and prepends overlays', () => {
    assert.equal(parseManyAgentMode('Plan'), 'plan');
    assert.ok(extraHitlToolNames('draft').includes('resource_create'));
    assert.deepEqual(extraHitlToolNames('plan'), ['questionnaire']);
    const messages = applyAgentModeToMessages([{ role: 'user', content: 'hola' }], 'plan');
    assert.equal(messages[0].role, 'system');
    assert.match(messages[0].content, /PLAN MODE ACTIVE/);
    assert.match(messages[0].content, /questionnaire tool/);
  });
});

describe('explicit mode enforcement', () => {
  const { buildBeforeToolCall, HitlInterruptError } = require('../agents/agent-runtime.cjs');
  const { filterRuntimeToolsForMode, promptOverlayForAgentMode } = require('../agents/many-agent-mode.cjs');
  const allowlist = require('../agents/hitl-allowlist.cjs');
  const context = (name) => ({ toolCall: { id: 'call-1', name, arguments: {} }, context: { messages: [] } });

  it('replaces mode instructions on Plan → Agent → Draft without changing user text', () => {
    let messages = applyAgentModeToMessages([{ role: 'system', content: 'Persona' }, { role: 'user', content: 'Plan: quoted evidence' }], 'plan');
    messages = applyAgentModeToMessages(messages, 'agent');
    assert.doesNotMatch(messages[0].content, /\[PLAN MODE ACTIVE\]/);
    assert.match(messages[0].content, /\[AGENT MODE ACTIVE\]/);
    messages = applyAgentModeToMessages(messages, 'draft');
    assert.doesNotMatch(messages[0].content, /\[AGENT MODE ACTIVE\]/);
    assert.match(messages[0].content, /\[DRAFT MODE ACTIVE\]/);
    assert.equal(messages[1].content, 'Plan: quoted evidence');
    assert.deepEqual(applyAgentModeToMessages(messages, 'draft'), messages);
    assert.match(promptOverlayForAgentMode('agent'), /Do not switch modes yourself/);
  });

  it('hides writes and unclassified external tools from the actual Plan registry', () => {
    const names = ['resource_get', 'file_write', 'remember_fact', 'research_collect', 'browser_fill', 'dome_create_note', 'task', 'mcp_custom', 'questionnaire'];
    assert.deepEqual(filterRuntimeToolsForMode(names.map(name => ({ name })), 'plan', ['mcp_custom']).map(tool => tool.name), ['resource_get', 'questionnaire']);
  });

  it('blocks Plan writes even after skip-HITL and prior approve-all', async () => {
    allowlist.approveAllForThread('mode-plan-test');
    const hook = buildBeforeToolCall({ agentMode: 'plan', skipHitl: true, threadId: 'mode-plan-test', modeExternalToolNames: ['mcp_custom'] });
    for (const name of ['file_write', 'remember_fact', 'research_collect', 'browser_click', 'task', 'mcp_custom']) {
      assert.equal((await hook(context(name)))?.block, true, name);
    }
    assert.equal(await hook(context('resource_get')), undefined);
    allowlist.clearThread('mode-plan-test');
  });

  it('Draft requests approval for every mutation and does not inherit Agent approve-all', async () => {
    allowlist.approveAllForThread('mode-draft-test');
    const hook = buildBeforeToolCall({ agentMode: 'draft', skipHitl: true, threadId: 'mode-draft-test', modeExternalToolNames: ['mcp_custom'] });
    for (const name of ['resource_create', 'file_edit', 'browser_fill', 'mcp_custom', 'resource_update']) {
      await assert.rejects(hook(context(name)), HitlInterruptError);
    }
    assert.equal(await hook(context('resource_get')), undefined);
    allowlist.approveAllForThread('mode-draft-test:draft');
    assert.equal(await hook(context('resource_create')), undefined);
    allowlist.clearThread('mode-draft-test');
    allowlist.clearThread('mode-draft-test:draft');
  });

  it('Agent keeps normal writes available and does not require planning approval', async () => {
    const hook = buildBeforeToolCall({ agentMode: 'agent', skipHitl: true });
    assert.equal(await hook(context('resource_create')), undefined);
  });
});
