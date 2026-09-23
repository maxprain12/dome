import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cmsTools = require('../plugins/cms-tools.cjs');
const { getAllToolDefinitions } = require('../tools/tool-definitions.cjs');
const { executeToolInMain } = require('../tools/tool-dispatcher.cjs');
const { filterToolDefinitionsForMode, extraHitlToolNames } = require('../agents/many-agent-mode.cjs');

test('configured CMS contributes Many tools; disabling it removes them', async () => {
  const plugin = {
    id: 'dome-cms', enabled: true, configured: true,
    contributes: { tools: ['list_entries', 'get_entry', 'update_entry', 'publish_entry'] },
  };
  const calls = [];
  cmsTools.setPluginService({
    listPlugins: () => [plugin],
    request: async (...args) => { calls.push(args); return { ok: true }; },
  });
  try {
    const definitions = getAllToolDefinitions();
    const names = definitions.map((def) => def.function.name);
    assert.ok(names.includes('dome_cms_list_entries'));
    assert.ok(names.includes('dome_cms_publish_entry'));
    assert.ok(!filterToolDefinitionsForMode(definitions, 'plan').some((def) => def.function.name === 'dome_cms_update_entry'));
    assert.ok(filterToolDefinitionsForMode(definitions, 'plan').some((def) => def.function.name === 'dome_cms_get_entry'));
    assert.ok(extraHitlToolNames('draft').includes('dome_cms_update_entry'));
    assert.deepEqual(await executeToolInMain('dome_cms_list_entries', { limit: 10 }), { ok: true });
    assert.deepEqual(calls[0], ['dome-cms', 'notes.listReadonly', { limit: 10 }]);
    assert.equal((await executeToolInMain('dome_cms_publish_entry', { id: 'pub-1' })).status, 'error');
    assert.equal(calls.length, 1);
    assert.deepEqual(await executeToolInMain('dome_cms_publish_entry', { id: 'pub-1' }, { hitlApproved: true }), { ok: true });
    assert.deepEqual(calls[1], ['dome-cms', 'publication.requestApproval', { id: 'pub-1' }]);
    plugin.enabled = false;
    assert.ok(!getAllToolDefinitions().some((def) => def.function.name === 'dome_cms_list_entries'));
    assert.equal((await executeToolInMain('dome_cms_list_entries', {})).status, 'error');
    assert.equal(calls.length, 2);
    plugin.enabled = true;
    plugin.configured = false;
    assert.ok(!getAllToolDefinitions().some((def) => def.function.name === 'dome_cms_list_entries'));
  } finally {
    cmsTools.setPluginService(null);
  }
});
