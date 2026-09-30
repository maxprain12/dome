import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseComplementUrl, enqueueComplementLink, takeComplementLinks } = require('../core/complement-links.cjs');

test('all supported categories open an identity, without executable URL parameters', () => {
  for (const category of ['plugins', 'agents', 'workflows', 'skills', 'mcp']) {
    assert.deepEqual(parseComplementUrl(`dome://complements/${category}/dome-cms`), { category, id: 'dome-cms' });
  }
  for (const url of ['https://complements/plugins/dome-cms', 'dome://complements/plugins/dome-cms?repo=evil/repo', 'dome://complements/plugins/../x', 'dome://complements/unknown/id', 'dome://complements/plugins/%2Fetc', 'dome://complements/plugins/id#command', 'dome://complements/plugins/' + 'x'.repeat(121)]) assert.equal(parseComplementUrl(url), null);
});

test('cold-start links survive before a window exists and are delivered once', () => {
  takeComplementLinks();
  assert.equal(enqueueComplementLink('dome://complements/plugins/dome-cms'), true);
  assert.deepEqual(takeComplementLinks(), [{ category: 'plugins', id: 'dome-cms' }]);
  assert.deepEqual(takeComplementLinks(), []);
});

test('warm links notify the renderer and retain unknown IDs for recoverable UI', () => {
  let notification;
  enqueueComplementLink('dome://complements/plugins/unknown-plugin', { broadcast: (...args) => { notification = args; } });
  assert.deepEqual(notification, ['dome:complement-link-pending', {}]);
  assert.deepEqual(takeComplementLinks(), [{ category: 'plugins', id: 'unknown-plugin' }]);
  assert.equal(enqueueComplementLink('dome://complements/plugins/id?command=rm'), false);
  assert.deepEqual(takeComplementLinks(), []);
});
