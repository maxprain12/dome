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
