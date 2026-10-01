import { createRequire } from 'node:module';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { createFreeSearch } = require('../services/web/free-search.cjs');
const searx = require('../services/web/providers/searxng.cjs');
const ddg = require('../services/web/providers/ddg-html.cjs');
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const request = { query: 'test', count: 3, timeoutMs: 1000 };

test('concurrent queries share outage backoff across the research/web entry points', async () => {
  let clock = 1000; let calls = 0; let recovered = false;
  const free = createFreeSearch({ now: () => clock, cooldownMs: 60000, providers: {
    searxng: { search: async () => { calls++; if (!recovered) throw Object.assign(new Error('429'), { retryAfterMs: 300000 }); return { success: true, results: [] }; } },
    ddg: { search: async () => { calls++; throw new Error('HTML challenge'); } },
  } });
  const results = await Promise.allSettled([free.search(request), free.search({ ...request, query: 'different' })]);
  assert.equal(calls, 2);
  for (const result of results) {
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason.code, 'search_unavailable');
    assert.equal(result.reason.retryable, false);
    assert.equal(result.reason.retryAfterMs, 300000);
  }
  await assert.rejects(free.searchProvider('searxng', request), /not a zero-results search/);
  assert.equal(calls, 2);
  recovered = true; clock += 300001;
  assert.equal((await free.search(request)).success, true);
  assert.equal(calls, 3);
});

test('a successful zero-result search remains distinct and does not open a circuit', async () => {
  let calls = 0;
  const free = createFreeSearch({ providers: { searxng: { search: async () => { calls++; return { success: true, results: [] }; } } } });
  assert.deepEqual((await free.search(request)).results, []);
  await free.search(request);
  assert.equal(calls, 2);
});

test('cancellation prevents subsequent providers without poisoning later searches', async () => {
  let calls = 0;
  const controller = new AbortController();
  const free = createFreeSearch({ providers: {
    searxng: { search: async () => { calls++; if (calls === 1) { controller.abort(); throw new Error('cancelled'); } return { success: true, results: [] }; } },
    ddg: { search: async () => { throw new Error('must not run'); } },
  } });
  await assert.rejects(free.search({ ...request, signal: controller.signal }), { name: 'AbortError' });
  assert.equal((await free.search(request)).success, true);
  assert.equal(calls, 2);
});

test('SearXNG distinguishes valid empty JSON, HTML challenges, 429 and cancellation', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ results: [] })); };
  assert.equal((await searx.search(request)).count, 0);
  assert.equal(calls, 1);
  globalThis.fetch = async () => new Response('<!doctype html><p>Challenge</p>');
  await assert.rejects(searx.search(request), /HTML challenge or invalid JSON/);
  globalThis.fetch = async () => new Response('', { status: 429, headers: { 'Retry-After': '600' } });
  await assert.rejects(searx.search(request), (error) => error.retryAfterMs === 600000);
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async () => { throw new Error('must not run'); };
  await assert.rejects(searx.search({ ...request, signal: controller.signal }), { name: 'AbortError' });
});

test('DuckDuckGo does not mistake a challenge page for zero results', async () => {
  globalThis.fetch = async () => new Response('<div class="no-results">No results</div>');
  assert.equal((await ddg.search(request)).count, 0);
  globalThis.fetch = async () => new Response('<form id="challenge-form">Verify you are human</form>', { status: 202 });
  await assert.rejects(ddg.search(request), /no parseable results/);
});
