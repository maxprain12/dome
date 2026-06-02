import assert from 'node:assert/strict';
import {
  capLangChainTools,
  providerNeedsOpenAiToolCap,
  sanitizeLeakedToolManifestText,
  parseFirstToolSelectorJson,
} from '../electron/tool-cap.cjs';
import { selectToolNamesForTurn } from '../electron/tool-selector.cjs';

const tools = Array.from({ length: 130 }, (_, i) => ({ name: `tool_${i}` }));
tools[0] = { name: 'task' };
tools[1] = { name: 'dome_load_doc' };

const capped = capLangChainTools(tools, { provider: 'openai', model: 'gpt-5.4' });
assert.equal(capped.length, 128);
assert.equal(capped[0].name, 'task');
assert.equal(capped[1].name, 'dome_load_doc');

assert.equal(providerNeedsOpenAiToolCap('openrouter', 'openai/gpt-5.4'), true);
assert.equal(providerNeedsOpenAiToolCap('anthropic', 'claude-3'), false);

const dirty = '{"tools":["task"]}{"tools":["read_file"]}Hola';
assert.equal(sanitizeLeakedToolManifestText(dirty), 'Hola');

const dup =
  '{"tools":["artifact_list","artifact_get"]} {"tools":["artifact_list","artifact_get"]}';
const parsed = parseFirstToolSelectorJson(dup);
assert.deepEqual(parsed?.tools, ['artifact_list', 'artifact_get']);

const available = new Set([
  'dome_load_doc',
  'artifact_update_state',
  'artifact_get',
  'web_search',
  'task',
  'remember_fact',
]);
const picked = selectToolNamesForTurn('remplaza el reproductor', available, {
  alwaysInclude: ['dome_load_doc'],
  maxTools: 6,
});
assert.ok(picked.includes('artifact_update_state'));
assert.ok(picked.includes('dome_load_doc'));

const localAvail = new Set(['file_read', 'file_tree', 'artifact_update_state', 'dome_load_doc']);
const localPick = selectToolNamesForTurn(
  'te he dejado el repo en /Users/maxprain/Documents/cupid-music-player',
  localAvail,
  { maxTools: 4 },
);
assert.ok(localPick.includes('file_read'));
assert.ok(localPick.includes('file_tree'));

console.log('test-tool-cap: ok');
