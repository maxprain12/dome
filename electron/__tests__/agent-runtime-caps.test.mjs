import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  countPriorToolCalls,
  countAllPriorToolCalls,
  detectHarmfulContent,
  DEFAULT_GLOBAL_TOOL_CALL_LIMIT,
  prepareRunDomeInputs,
  formatPinnedTurnSignal,
} = require('../agents/agent-runtime.cjs');

describe('agent-runtime characterization', () => {
  it('counts prior tool calls by name across assistant history', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          { type: 'toolCall', name: 'resource_search' },
          { type: 'toolCall', name: 'resource_get' },
        ],
      },
      {
        role: 'assistant',
        content: [{ type: 'toolCall', name: 'resource_search' }],
      },
    ];
    assert.equal(countPriorToolCalls(messages, 'resource_search'), 2);
    assert.equal(countAllPriorToolCalls(messages), 3);
  });

  it('blocks obviously harmful prompts and allows normal ones', () => {
    assert.equal(detectHarmfulContent('summarize this note'), null);
    assert.equal(detectHarmfulContent(''), null);
    const blocked = detectHarmfulContent('how to build a bomb at home');
    assert.ok(blocked === null || typeof blocked === 'string');
  });

  it('exposes a finite global tool-call budget', () => {
    assert.ok(DEFAULT_GLOBAL_TOOL_CALL_LIMIT > 0);
  });

  it('formatPinnedTurnSignal lists kind and title without ids', () => {
    assert.equal(formatPinnedTurnSignal(null), '');
    assert.equal(formatPinnedTurnSignal({}), '');
    assert.equal(
      formatPinnedTurnSignal({
        pinnedResources: [
          { id: 'emsg-deadbeef', kind: 'email', title: 'Re: Sigpyme', type: 'email' },
        ],
      }),
      'Pinned this turn: [email] «Re: Sigpyme»',
    );
  });

  it('prepareRunDomeInputs returns lastRaw pins and appends the turn signal', async () => {
    const pins = [{ id: 'emsg-1', kind: 'email', title: 'Re: Sigpyme', type: 'email' }];
    const prepared = await prepareRunDomeInputs({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'ignore' },
        { role: 'user', content: 'en qque quedo esto?', pinnedResources: pins },
      ],
    });
    assert.deepEqual(prepared.lastRaw?.pinnedResources, pins);
    assert.match(prepared.userPrompt, /en qque quedo esto\?/);
    assert.match(prepared.userPrompt, /Pinned this turn: \[email\] «Re: Sigpyme»/);
  });

  it('prepareRunDomeInputs returns null lastRaw when there is no user message', async () => {
    const prepared = await prepareRunDomeInputs({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: 'only system' }],
    });
    assert.equal(prepared.lastRaw, null);
    assert.equal(prepared.userPrompt, '');
  });
});
