import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getAllToolDefinitions } = require('../tools/tool-definitions.cjs');
const { applyToolStubs } = require('../tools/tool-stubs.cjs');
const { capLangChainTools } = require('../tools/tool-cap.cjs');
const { buildDomeSystemPrompt, getCoreSectionsForAssembler, formatVolatileSourceContext } = require('../prompts/system-prompt.cjs');

test('capabilities can execute directly after stubbing and survive provider catalog limits', async () => {
  let invoked = false;
  const tools = getAllToolDefinitions().map((def) => ({ ...def.function,
    execute: async () => { invoked = true; return { success: true }; },
  }));
  const original = tools.find((tool) => tool.name === 'research_capabilities');
  const stubbed = applyToolStubs(tools).offered;
  assert.equal(stubbed.find((tool) => tool.name === 'research_capabilities'), original);
  const capped = capLangChainTools(stubbed, { provider: 'openai', model: 'gpt-5.6' });
  const capability = capped.find((tool) => tool.name === 'research_capabilities');
  for (const name of ['research_search', 'research_read', 'research_profile', 'research_collect']) assert.ok(capped.some((tool) => tool.name === name), `${name} must survive the cap`);
  assert.ok(capability); await capability.execute(); assert.equal(invoked, true);
});

test('minimal production prompt routes profile investigations and states the real LinkedIn/browser limits', () => {
  const prompt = buildDomeSystemPrompt({ coreToolsMode: 'minimal', includeDate: false });
  assert.match(prompt, /call research_capabilities before attempting collection/);
  assert.match(prompt, /LinkedIn automated profile research remains pending/);
  assert.match(prompt, /browser_get_active_tab is macOS URL\/title metadata only/);
  assert.match(prompt, /Never ask the user to execute tool names/);
  assert.match(prompt, /research other public sources with research_search/);
  assert.match(getCoreSectionsForAssembler().roleMany, /third-party profile URL.*research_capabilities/);
});

test('pinned profile guidance starts with access diagnosis instead of the legacy resolver', () => {
  const source = formatVolatileSourceContext({ pinnedSources: [{ kind: 'social_profile', id: 'profile', title: 'Provided profile' }] });
  assert.match(source, /research_capabilities \(analyze supplied evidence before remote reads\)/);
  assert.doesNotMatch(source, /→ social_public_resolve/);
});
