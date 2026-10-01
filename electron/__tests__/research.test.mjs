import { createRequire } from 'node:module';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const { capabilities } = require('../research/catalog.cjs');
const budget = require('../research/budget.cjs');
const { parseFeed } = require('../research/rss.cjs');
const { evidence } = require('../research/evidence.cjs');
const control = require('../browser-extension/research-control.cjs');
const { createResearchService } = require('../research/service.cjs');
function queries() {
  const values = new Map();
  return { getSetting: { get: (key) => values.has(key) ? { value: values.get(key) } : undefined },
    setSetting: { run: (key, value) => values.set(key, value) } };
}
afterEach(() => control.stop());
test('16 channels separate access, configuration and verification', () => {
  const rows = capabilities({ enabledProviders: ['exa'] });
  assert.equal(rows.length, 16);
  assert.equal(new Set(rows.map((r) => r.platform)).size, 16);
  assert.equal(rows.find((r) => r.platform === 'linkedin').accessStatus, 'pending_enablement');
  assert.ok(rows.every((r) => r.verifiedAt === null));
});
test('budgets opt in, reserve before concurrent calls, survive reconstruction and reset by UTC month', () => {
  const q = queries();
  assert.throws(() => budget.reserve(q, 'r', 'exa'), /provider_not_enabled/);
  q.setSetting.run(budget.POLICY_KEY, JSON.stringify({ enabledProviders: ['exa'], perRunUsd: 0.014, monthlyUsd: 0.014 }));
  budget.reserve(q, 'r', 'exa'); budget.reserve(q, 'r', 'exa');
  assert.throws(() => budget.reserve(q, 'r', 'exa'), /run_budget_exceeded/);
  assert.throws(() => budget.reserve(q, 'other', 'exa'), /monthly_budget_exceeded/);
  assert.equal(budget.ledger(q).spent, 0.014);
  assert.equal(budget.ledger(q, Date.UTC(2030, 1, 1)).spent, 0);
});
test('RSS and Atom preserve dates, links and partial coverage, reject entity expansion', () => {
  const rss = parseFeed('<rss><channel><item><title>A</title><link>https://example.com/a</link><description>Body</description></item></channel></rss>', 'https://example.com/feed');
  assert.equal(rss[0].publishedAt, null); assert.equal(rss[0].coverage.completeHistory, false);
  const atom = parseFeed('<feed><entry><title>B</title><link href="/b"/><updated>2026-01-01T00:00:00Z</updated><summary>Text</summary></entry></feed>', 'https://example.com/feed');
  assert.equal(atom[0].url, 'https://example.com/b'); assert.ok(atom[0].publishedAt);
  assert.throws(() => parseFeed('<!DOCTYPE rss [<!ENTITY a "b">]><rss/>', 'https://example.com'), /unsafe/);
});
test('unknown metrics stay null; evidence IDs are stable', () => {
  const input = { platform: 'web', url: 'https://example.com/a', text: 'fact', method: 'test' };
  const first = evidence(input);
  assert.equal(first.metrics, null); assert.equal(first.id, evidence(input).id);
});
test('browser requires explicit tab and enforces owner, exact URL, busy state and revocation', async () => {
  const sessionId = crypto.randomUUID(); const url = 'https://example.com/a';
  assert.equal((await control.read(url)).status, 'requires_connection');
  control.poll('owner', { sessionId, url, enabled: true });
  const result = control.read(url);
  assert.equal((await control.read(url)).error, 'browser_busy');
  const { requests } = control.poll('owner', { sessionId, url, enabled: true });
  assert.equal(requests.length, 1);
  assert.throws(() => control.complete('other', { sessionId, callId: requests[0].callId, result: { success: false } }), /owner/);
  control.complete('owner', { sessionId, callId: requests[0].callId, result: { success: true, data: { url: 'https://example.com/changed', readableText: 'wrong' } } });
  assert.equal((await result).error, 'selected_tab_changed');
  const revoked = control.read(url); control.revoke('owner');
  assert.equal((await revoked).error, 'browser_disconnected');
});
test('browser cancellation and strict result schema exclude secrets', async () => {
  const sessionId = crypto.randomUUID(); const url = 'https://example.com/';
  control.poll('owner', { sessionId, url, enabled: true });
  const signal = new AbortController(); const promise = control.read(url, signal.signal);
  signal.abort(); assert.equal((await promise).error, 'cancelled');
  assert.equal(control.Result.safeParse({ sessionId, callId: crypto.randomUUID(), result: { success: true, cookies: 'secret' } }).success, false);
});
test('blocked sources cannot be bypassed as web and invalid inputs never execute', async () => {
  const service = createResearchService({ queries: queries() });
  assert.equal((await service.execute('research_read', { url: 'https://linkedin.com/in/test' })).error, 'source_pending_enablement');
  assert.equal((await service.execute('research_profile', { platform: 'youtube', url: 'https://youtube.com/' })).error, 'profile_pending_enablement');
  assert.equal((await service.execute('research_read', { url: 'file:///etc/passwd' })).success, false);
});
test('provider failure is conservatively charged and cancellation prevents subsequent acquisition', async () => {
  const q = queries();
  q.setSetting.run('web_search_exa_api_key', 'test-key');
  q.setSetting.run(budget.POLICY_KEY, JSON.stringify({ enabledProviders: ['exa'], perRunUsd: 0.25, monthlyUsd: 10 }));
  let calls = 0;
  const service = createResearchService({ queries: q, searchProviders: { exa: async () => { calls++; throw new Error('failed'); } } });
  assert.equal((await service.execute('research_search', { platform: 'exa_search', query: 'test' }, { threadId: 'r' })).success, false);
  assert.equal(budget.ledger(q).spent, 0.007);
  const controller = new AbortController(); controller.abort();
  await service.execute('research_search', { platform: 'exa_search', query: 'test' }, { signal: controller.signal });
  assert.equal(calls, 1); assert.equal(budget.ledger(q).spent, 0.007);
});
test('research reports a public-search outage with no fabricated evidence or paid fallback', async () => {
  let paid = 0;
  const service = createResearchService({ queries: queries(),
    freeSearch: async () => { throw Object.assign(new Error('Public search unavailable'), { code: 'search_unavailable', retryAfterMs: 60000 }); },
    searchProviders: { exa: async () => { paid++; } },
  });
  const result = await service.execute('research_search', { query: 'Unknown person' });
  assert.equal(result.success, false); assert.equal(result.code, 'search_unavailable');
  assert.equal(result.retryable, false); assert.equal(result.retryAfterMs, 60000);
  assert.deepEqual(result.evidence, []); assert.equal(paid, 0);
});
test('collect saves cited evidence while retaining source failures and stops after cancellation', async () => {
  let saved;
  const q = queries();
  const controller = new AbortController();
  const service = createResearchService({ queries: q, validateUrl: async () => {},
    fetchPage: async ({ url }) => { if (url.endsWith('/bad')) throw new Error('unavailable'); return { success: true, title: 'A fact', content: 'Observed', finalUrl: url }; },
    saveResource: async (data) => { saved = data; return { success: true, resource: { id: 'saved' } }; },
  });
  const result = await service.execute('research_collect', { urls: ['https://example.com/good', 'https://example.com/bad'], save: true }, { projectId: 'project' });
  assert.equal(result.status, 'partial'); assert.equal(result.resourceId, 'saved');
  assert.equal(result.evidence.length, 1); assert.equal(result.failures.length, 1);
  assert.match(saved.content, /Source: <https:\/\/example.com\/good>/); assert.equal(saved.project_id, 'project');
  let calls = 0;
  const cancelling = createResearchService({ queries: queries(), validateUrl: async () => {}, fetchPage: async () => { calls++; controller.abort(); return { success: true, content: 'partial' }; } });
  const stopped = await cancelling.execute('research_collect', { urls: ['https://example.com/one','https://example.com/two'] }, { signal: controller.signal });
  assert.equal(stopped.status, 'cancelled'); assert.equal(calls, 1);
});
test('a browser collection without an explicitly enabled tab waits for connection', async () => {
  const service = createResearchService({ queries: queries(), validateUrl: async () => {}, browser: control });
  const result = await service.execute('research_collect', { url: 'https://example.com/', source: 'browser' });
  assert.equal(result.status, 'requires_connection'); assert.equal(result.evidence.length, 0);
});
test('Exa uses bounded Auto without paid Contents/Deep and accepts zero results', async () => {
  const original = globalThis.fetch;
  let body;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.exa.ai/search'); body = JSON.parse(options.body);
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };
  try {
    const result = await require('../services/web/providers/exa-search.cjs').search({ query: 'test', count: 50, timeoutMs: 1000 }, 'test-key');
    assert.deepEqual(body, { query: 'test', type: 'auto', numResults: 10 });
    assert.equal(result.success, true); assert.equal(result.count, 0);
  } finally { globalThis.fetch = original; }
});
test('renderer IPC cancellation propagates the signal and rejects invalid or foreign requests', async () => {
  const modulePath = require.resolve('../research/service.cjs');
  const original = require.cache[modulePath].exports;
  require.cache[modulePath].exports = { ...original, getResearchService: () => ({
    execute: async (_name, _input, { signal }) => new Promise((resolve) => signal.addEventListener('abort', () => resolve({ success: false, error: 'cancelled' }), { once: true })),
    cancel: () => ({ success: false }),
  }) };
  const ipcPath = require.resolve('../ipc/ai/research.cjs');
  delete require.cache[ipcPath];
  try {
    const handlers = new Map();
    require(ipcPath).register({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, windowManager: { isAuthorized: () => true } });
    const event = { sender: { id: 1 } }, id = crypto.randomUUID();
    const request = handlers.get('research:execute')(event, { name: 'research_collect', input: { url: 'https://example.com' }, requestId: id });
    assert.equal(handlers.get('research:cancel')({ sender: { id: 2 } }, { id }).success, false);
    assert.equal(handlers.get('research:cancel')(event, { id }).success, true);
    assert.equal((await request).error, 'cancelled');
    assert.equal((await handlers.get('research:execute')(event, { name: 'arbitrary', input: {} })).success, false);
  } finally { require.cache[modulePath].exports = original; delete require.cache[ipcPath]; }
});
test('capabilities advertise web search and collections bound multi-item sources', async () => {
  assert.ok(capabilities().find((item) => item.platform === 'web').operations.includes('search'));
  const service = createResearchService({ queries: queries(), validateUrl: async () => {}, resolveSocial: async () => ({ card: {
    provider: 'x', kind: 'profile', url: 'https://x.com/test', body: 'Profile', recentPosts: Array.from({ length: 50 }, (_, i) => ({ url: `https://x.com/test/status/${i}`, body: 'Post' })),
  } }) });
  const result = await service.execute('research_collect', { platform: 'x', url: 'https://x.com/test' });
  assert.equal(result.evidence.length, 30); assert.deepEqual(result.limitations, ['evidence_limit_30']);
  assert.equal(result.evidence[0].metrics.followers, null);
});
