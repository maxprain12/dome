import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
// Unit-test the OS encryption boundary without writing to a real keychain.
const electronPath = require.resolve('electron');
const storage = { available: true, isEncryptionAvailable() { return this.available; },
  encryptString: (text) => Buffer.from(`protected:${text}`),
  decryptString: (buffer) => buffer.toString().replace(/^protected:/, ''),
};
require.cache[electronPath] = { exports: { safeStorage: storage } };
const { createResearchService, configuredWebSearch } = require('../research/service.cjs');
const settings = require('../research/settings.cjs');
const budget = require('../research/budget.cjs');
const secret = require('../core/settings-secrets.cjs');
function memory() {
  const values = new Map(); let fail = false;
  return { values, getSetting: { get: (key) => values.has(key) ? { value: values.get(key) } : undefined },
    setSetting: { run: (key, value) => { if (fail && key === settings.CONFIG_KEY) throw new Error('disk'); values.set(key, value); } },
    transaction(callback) { const snapshot = new Map(values); try { callback(); } catch (error) { values.clear(); for (const [key, value] of snapshot) values.set(key, value); throw error; } },
    failWrite() { fail = true; },
  };
}
const config = (patch = {}) => ({ policy: { ...budget.DEFAULT_POLICY, enabledProviders: [] }, routing: settings.Routing.parse({}), keys: {}, ...patch });
const save = (q, input) => settings.configure(q, input, (callback) => q.transaction(callback));

test('configuration requires explicit valid opt-in, preserves keys, encrypts changes and removes deliberately', () => {
  const q = memory();
  assert.equal(save(q, config({ policy: { ...budget.DEFAULT_POLICY, enabledProviders: ['exa'] } })).error, 'provider_key_required');
  assert.equal(q.values.size, 0);
  assert.equal(save(q, config({ keys: { exa: '••••••••' } })).error, 'invalid_configuration');
  const input = config({ keys: { exa: 'private-test-key' }, policy: { ...budget.DEFAULT_POLICY, enabledProviders: ['exa'] } });
  assert.equal(save(q, input).success, true);
  assert.notEqual(q.values.get(settings.KEY_NAMES.exa), 'private-test-key');
  assert.equal(secret.readSettingSecret(q, settings.KEY_NAMES.exa), 'private-test-key');
  assert.equal(save(q, { ...input, keys: {} }).success, true);
  assert.equal(secret.readSettingSecret(q, settings.KEY_NAMES.exa), 'private-test-key');
  assert.equal(save(q, config({ keys: { exa: null } })).success, true);
  assert.equal(secret.readSettingSecret(q, settings.KEY_NAMES.exa), null);
  assert.deepEqual(budget.policy(q).enabledProviders, []);
});

test('failed transaction does not leave credentials, permissions or routes partially saved', () => {
  const q = memory(); save(q, config()); const before = new Map(q.values); q.failWrite();
  assert.equal(save(q, config({ keys: { brave: 'new-key' }, routing: settings.Routing.parse({ webSource: 'browser' }) })).error, 'configuration_save_failed');
  assert.deepEqual(q.values, before);
});

test('new credentials fail closed when OS encryption is unavailable', () => {
  const q = memory(); storage.available = false;
  try { assert.equal(save(q, config({ keys: { exa: 'secret' } })).error, 'encryption_unavailable'); assert.equal(q.values.size, 0); }
  finally { storage.available = true; }
});

test('local doctor survives disconnected browser, does not probe and distinguishes key from permission', () => {
  const q = memory(); let calls = 0;
  save(q, config({ keys: { exa: 'key-for-diagnosis' } }));
  const service = createResearchService({ queries: q, browser: { status: () => { throw new Error('closed'); } }, freeSearch: () => { calls++; } });
  const status = service.status();
  assert.equal(status.channels.length, 16); assert.equal(calls, 0);
  assert.equal(status.upstream.license, 'MIT');
  assert.equal(status.channels.find((item) => item.platform === 'exa_search').readiness, 'requires_permission');
  assert.equal(status.channels.find((item) => item.platform === 'linkedin').readiness, 'pending_enablement');
  assert.ok(status.channels.every((item) => item.verifiedAt === null && item.lastCheck === null));
  assert.ok(!JSON.stringify(status).includes('key-for-diagnosis'));
});

test('disabled sources reject search, read, profiles and collections before any call', async () => {
  const q = memory(); let calls = 0;
  save(q, config({ routing: settings.Routing.parse({ disabledPlatforms: ['web', 'github'] }) }));
  const service = createResearchService({ queries: q, fetchPage: () => { calls++; }, freeSearch: () => { calls++; }, githubFetch: () => { calls++; } });
  for (const name of ['research_search', 'research_read', 'research_collect', 'research_profile']) {
    const result = await service.execute(name, { platform: 'github', url: 'https://github.com/test', query: 'test' });
    assert.equal(result.error, 'source_disabled');
  }
  assert.equal(calls, 0); assert.deepEqual(service.status().channels.find((item) => item.platform === 'github').operations, []);
});

test('free preference cannot spend and an explicit paid preference does not silently fall back', async () => {
  const q = memory(); let freeCalls = 0; let braveCalls = 0; let tavilyCalls = 0;
  const input = config({ keys: { brave: 'brave-key', tavily: 'tavily-key' }, policy: { ...budget.DEFAULT_POLICY, enabledProviders: ['tavily', 'brave'] }, routing: settings.Routing.parse({ searchProvider: 'free' }) });
  save(q, input);
  const service = createResearchService({ queries: q,
    freeSearch: async () => { freeCalls++; return { provider: 'ddg', results: [] }; },
    searchProviders: { brave: async () => { braveCalls++; throw new Error('outage'); }, tavily: async () => { tavilyCalls++; return { results: [] }; } },
  });
  assert.equal((await service.execute('research_search', { query: 'public' })).success, true);
  assert.equal(budget.ledger(q).spent, 0); assert.equal(freeCalls, 1);
  save(q, { ...input, keys: {}, routing: settings.Routing.parse({ searchProvider: 'brave' }) });
  assert.equal((await service.execute('research_search', { query: 'explicit' })).success, false);
  assert.equal(braveCalls, 1); assert.equal(tavilyCalls, 0); assert.equal(freeCalls, 1);
});

test('Many legacy search honors saved routes, opt-ins, budgets and cancellation without bypasses', async () => {
  const q = memory(); let calls = 0;
  const service = createResearchService({ queries: q, freeSearch: async () => {
    calls++; return { provider: 'ddg', results: [{ title: 'Source', url: 'https://example.com', description: 'Evidence' }] };
  } });
  assert.equal(await configuredWebSearch(q, { query: 'legacy' }, {}, service), null);
  save(q, config({ routing: settings.Routing.parse({ searchProvider: 'free' }) }));
  assert.equal(await configuredWebSearch(q, { query: 'settings connection test' }, null, service), null);
  const result = await configuredWebSearch(q, { query: 'query', count: 1 }, {}, service);
  assert.equal(result.provider, 'ddg'); assert.equal(result.count, 1); assert.equal(result.results[0].description, 'Evidence');
  assert.equal(budget.ledger(q).spent, 0); assert.equal(calls, 1);
  const controller = new AbortController(); controller.abort();
  assert.equal((await configuredWebSearch(q, { query: 'cancelled' }, { signal: controller.signal }, service)).error, 'cancelled');
  save(q, config({ routing: settings.Routing.parse({ disabledPlatforms: ['web'] }) }));
  assert.equal((await configuredWebSearch(q, { query: 'disabled' }, {}, service)).error, 'source_disabled');
  assert.equal(calls, 1);
  save(q, config({ keys: { exa: 'key' }, policy: { ...budget.DEFAULT_POLICY, perRunUsd: 0, enabledProviders: ['exa'] }, routing: settings.Routing.parse({ searchProvider: 'exa' }) }));
  assert.equal((await configuredWebSearch(q, { query: 'blocked budget' }, {}, service)).status, 'error');
  assert.equal(calls, 1);
});

test('browser preference applies to Many reads; probes are bounded, cancellable and never save', async () => {
  const q = memory(); let saved = 0; let direct = 0; let browserReads = 0; let count;
  save(q, config({ routing: settings.Routing.parse({ webSource: 'browser' }) }));
  const service = createResearchService({ queries: q, validateUrl: async () => {},
    browser: { read: async (url) => { browserReads++; return { success: true, data: { url, readableText: 'Visible source', title: 'Page' } }; }, status: () => ({ state: 'connected', sessions: [{ url: 'https://private-browser.example' }] }) },
    fetchPage: () => { direct++; }, saveResource: () => { saved++; },
    freeSearch: async (request) => { count = request.count; return { provider: 'ddg', results: [] }; },
  });
  assert.equal((await service.execute('research_read', { url: 'https://example.com' })).success, true);
  assert.equal(browserReads, 1); assert.equal(direct, 0);
  await service.probe('research_search', { query: 'private query', count: 10, save: true });
  assert.equal(count, 1); assert.equal(saved, 0);
  const controller = new AbortController(); controller.abort();
  assert.equal((await service.probe('research_read', { url: 'https://example.com' }, { signal: controller.signal })).success, false);
  assert.equal(browserReads, 1);
  const report = JSON.stringify(service.report());
  assert.ok(!report.includes('private query')); assert.ok(!report.includes('private-browser.example')); assert.ok(!report.includes('Visible source'));
  assert.equal(service.status().channels.find((item) => item.platform === 'web').lastCheck.outcome, 'failed');
});

test('pending sources accept explicit normalized evidence imports without remote capture', async () => {
  const q = memory(); let saved; let calls = 0;
  const service = createResearchService({ queries: q, fetchPage: () => { calls++; },
    saveResource: async (input) => { saved = input; return { success: true, resource: { id: 'new-note' } }; },
  });
  const result = await service.importEvidence({ platform: 'linkedin', url: 'https://www.linkedin.com/in/test?token=hidden', title: 'Profile evidence', text: 'Observed role' });
  assert.equal(result.resourceId, 'new-note'); assert.equal(calls, 0);
  assert.equal(saved.metadata.evidence[0].provenance.method, 'user_import');
  assert.equal(saved.metadata.evidence[0].coverage.completeHistory, false);
  assert.ok(!saved.content.includes('token=hidden'));
  assert.equal((await service.importEvidence({ platform: 'linkedin', url: 'file:///tmp/x', title: 'Invalid', text: 'data' })).success, false);
});

test('a profile probe returns one sample even when the snapshot contains multiple posts', async () => {
  const service = createResearchService({ queries: memory(), validateUrl: async () => {},
    resolveSocial: async () => ({ card: { provider: 'instagram', url: 'https://www.instagram.com/fixture', body: 'Profile',
      author: { name: 'Fixture' }, recentPosts: [{ url: 'https://www.instagram.com/p/fixture', body: 'Post' }] } }),
  });
  const result = await service.probe('research_profile', { platform: 'instagram', url: 'https://www.instagram.com/fixture' });
  assert.equal(result.success, true); assert.equal(result.evidence.length, 1); assert.equal(result.check.evidenceCount, 1);
});

test('settings IPC rejects untrusted senders and malformed bodies without reaching database', async () => {
  const { register } = require('../ipc/ai/research.cjs'); const handlers = new Map();
  register({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, windowManager: { isAuthorized: (id) => id === 1 }, database: { getQueries: () => { throw new Error('must not access'); } } });
  for (const name of ['research:configure', 'research:test', 'research:import', 'research:report']) {
    assert.equal((await handlers.get(name)({ sender: { id: 2 } }, {})).error, 'Unauthorized');
  }
  for (const name of ['research:configure', 'research:test', 'research:import']) {
    assert.equal((await handlers.get(name)({ sender: { id: 1 } }, { cookies: 'no' })).success, false);
  }
});
