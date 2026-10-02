import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { parseHTML } = require('linkedom');
const { Slots } = require('../browser-native/async.cjs');
const { inspectSearchPage, normalizeResults, searchUrl } = require('../services/web/search-engines.cjs');
const { createSearchService } = require('../services/web/search-dispatcher.cjs');

function inspect(engine, html) {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  return vm.runInNewContext(`(${inspectSearchPage.toString()})(${JSON.stringify(engine)})`, { document });
}
test('extracts observed organic sources for all engines and distinguishes captcha/empty/changed DOM', () => {
  const fixtures = {
    duckduckgo: '<article data-testid="result"><a data-testid="result-title-a" href="https://example.org/a">A</a><p data-testid="result-snippet">Source A</p></article>',
    bing: '<ol id="b_results"><li class="b_algo"><h2><a href="https://example.org/a">A</a></h2><div class="b_caption"><p>Source A</p></div></li></ol>',
    google: '<div id="search"><div class="MjjYud"><a href="https://example.org/a"><h3>A</h3></a><div class="VwiC3b">Source A</div></div></div>',
  };
  for (const [engine, html] of Object.entries(fixtures)) {
    const result = inspect(engine, html);
    assert.equal(result.status, 'success');
    assert.equal(result.entries[0].description, 'Source A');
  }
  assert.equal(inspect('bing', '<div id="b_captcha">Challenge</div>').status, 'captcha');
  assert.equal(inspect('google', '<p>No results found</p>').status, 'empty');
  assert.equal(inspect('duckduckgo', '<p>Unknown layout</p>').status, 'page_changed');
});
test('unwraps result URLs, removes duplicates and excludes engine links and unsafe protocols', () => {
  const rows = normalizeResults([
    { title: 'A', url: 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fa%3Futm_source%3Dx' },
    { title: 'A again', url: 'https://example.org/a#section' },
    { title: 'Search', url: 'https://www.bing.com/search?q=x' },
    { title: 'Unsafe', url: 'javascript:alert(1)' },
    { title: 'Google wrap', url: 'https://www.google.com/url?q=https%3A%2F%2Fexample.org%2Fb' },
  ], 10);
  assert.deepEqual(rows.map((row) => row.url), ['https://example.org/a', 'https://example.org/b']);
  assert.equal(new URL(searchUrl('google', { query: 'a & b', freshness: 'week', country: 'ES' })).searchParams.get('q'), 'a & b');
});
test('two browser slots, queued cancellation and idempotent release', async () => {
  const slots = new Slots(2);
  const first = await slots.acquire();
  const second = await slots.acquire();
  const abort = new AbortController();
  const queued = slots.acquire(abort.signal);
  abort.abort();
  await assert.rejects(queued, { name: 'AbortError' });
  first(); first(); second();
  assert.equal(slots.active, 0);
  assert.equal(slots.queue.length, 0);
});
function fakeBrowser(statuses = ['success']) {
  let calls = 0;
  let closed = 0;
  return { get calls() { return calls; }, get closed() { return closed; },
    async run(id, signal, fn) { return fn({ id }); },
    async navigate() { calls++; await new Promise((resolve) => setImmediate(resolve)); },
    async evaluate() { const status = statuses.shift() || 'success'; return { status, entries: status === 'success' ? [{ title: 'Observed', url: 'https://example.org/source' }] : [] }; },
    rememberRecovery() { return 'recovery'; }, close() { closed++; },
  };
}
test('falls back only on failures, coalesces concurrent searches, caches successful results and expires cache', async () => {
  let now = 0;
  const browser = fakeBrowser(['captcha', 'success']);
  const service = createSearchService(browser, () => now);
  const [first, second] = await Promise.all([service.search({ query: 'dome' }), service.search({ query: 'dome' })]);
  assert.equal(first.engine, 'bing');
  assert.deepEqual(second, first);
  assert.equal(browser.calls, 2);
  assert.equal((await service.search({ query: 'dome' })).cached, true);
  now = 300001;
  await service.search({ query: 'dome' });
  assert.equal(browser.calls, 3);
  assert.equal(browser.closed, 2);
  const empty = fakeBrowser(['empty']);
  assert.equal((await createSearchService(empty).search({ query: 'unknown' })).status, 'empty');
  assert.equal(empty.calls, 1);
});
test('one cancelled caller does not abort another subscriber; invalid inputs fail before browser access', async () => {
  const browser = fakeBrowser();
  const service = createSearchService(browser);
  const abort = new AbortController();
  const first = service.search({ query: 'same' }, abort.signal);
  const second = service.search({ query: 'same' });
  abort.abort();
  assert.equal((await first).status, 'aborted');
  assert.equal((await second).success, true);
  await assert.rejects(service.search({ query: ' ', count: 100 }));
  assert.equal(browser.calls, 1);
});
test('retry after manual captcha recovery reuses its isolated partition and never caches the challenge', async () => {
  const browser = fakeBrowser(['captcha', 'success']);
  const partitions = [];
  browser.recoveryPartition = urls => urls.some(url => url.includes('duckduckgo.com')) ? 'captcha-isolated-partition' : undefined;
  browser.run = async (_id, _signal, fn, options) => { partitions.push(options?.partition); return fn({}); };
  const service = createSearchService(browser);
  assert.equal((await service.search({query:'retry',engine:'duckduckgo'})).status,'captcha');
  assert.equal((await service.search({query:'retry',engine:'duckduckgo'})).status,'success');
  assert.deepEqual(partitions,['captcha-isolated-partition','captcha-isolated-partition']);
  assert.equal(browser.calls,2);
});
test('signed Google organic redirects resolve locally, cancel bodies and reject private destinations', async () => {
  const {resolveEngineUrls}=require('../services/web/search-redirects.cjs');
  let cancelled=0;let requests=0;
  const entries=[{title:'A',url:'https://www.google.com/goto?url=signed'},{title:'Unsafe',url:'https://www.google.com/goto?url=private'}];
  const result=await resolveEngineUrls(entries,undefined,{validateUrl:async url=>{if(url.includes('127.0.0.1'))throw new Error('private');},fetch:async (url,options)=>{
    requests++;assert.equal(options.redirect,'manual');return {status:302,headers:{get:()=>url.searchParams.get('url')==='private'?'http://127.0.0.1/secret':'https://example.org/final'},body:{cancel:async()=>{cancelled++;}}};
  }});
  assert.deepEqual(result,[{title:'A',url:'https://example.org/final'}]);assert.equal(requests,2);assert.equal(cancelled,2);
});
