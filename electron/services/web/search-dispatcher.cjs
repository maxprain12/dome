'use strict';

const { randomUUID } = require('node:crypto');
const { z } = require('zod');
const { bounded } = require('../../browser-native/async.cjs');
const { ENGINES, searchUrl, inspectSearchPage, normalizeResults } = require('./search-engines.cjs');

const SearchSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  count: z.number().int().min(1).max(10).default(5),
  engine: z.enum(['auto', ...ENGINES]).default('auto'),
  country: z.string().regex(/^[a-zA-Z]{2}$/).optional(),
  search_lang: z.string().regex(/^[a-zA-Z]{2,3}(-[a-zA-Z]{2})?$/).optional(),
  freshness: z.enum(['day', 'week', 'month', 'year']).optional(),
}).strict();

function createSearchService(browser, now = Date.now) {
  const cache = new Map();
  const inflight = new Map();
  async function execute(request, signal) {
    const engines = request.engine === 'auto' ? ['duckduckgo', 'bing'] : [request.engine];
    const owner = `search:${randomUUID()}`;
    const partition = browser.recoveryPartition?.(engines.map((engine) => searchUrl(engine, request)));
    let last;
    try {
      return await browser.run(owner, signal, async (item) => {
        for (const engine of engines) {
          const url = searchUrl(engine, request);
          try {
            await browser.navigate(item, url, signal);
            const inspected = await browser.evaluate(item, `(${inspectSearchPage.toString()})(${JSON.stringify(engine)})`, signal);
            const entries = await require('./search-redirects.cjs').resolveEngineUrls(inspected.entries.slice(0, request.count * 2), signal);
            const results = normalizeResults(entries, request.count);
            const status = inspected.status === 'success' && !results.length ? 'page_changed' : inspected.status;
            last = { success: ['success', 'empty'].includes(status), status, query: request.query, engine, searchUrl: url,
              capturedAt: new Date(now()).toISOString(), results };
            if (last.success) return last;
            if (status === 'captcha') last.recoveryId = browser.rememberRecovery(item, url);
          } catch (error) {
            if (signal.aborted) throw error;
            last = { success: false, status: error.code || 'navigation_failed', error: error.message, query: request.query, engine, results: [] };
          }
        }
        return last;
      }, partition ? { partition } : undefined);
    } finally { await browser.close(owner); }
  }

  async function search(args, callerSignal) {
    const request = SearchSchema.parse(args);
    if (callerSignal?.aborted) return { success: false, status: 'aborted', results: [] };
    const key = JSON.stringify(request);
    for (const [cachedKey, saved] of cache) if (saved.expires <= now()) cache.delete(cachedKey);
    const saved = cache.get(key);
    if (saved) return { ...saved.value, cached: true };
    let job = inflight.get(key);
    if (!job) {
      const controller = new AbortController();
      job = { controller, callers: 0 };
      const timer = setTimeout(() => controller.abort(Object.assign(new Error('Search timed out'), { code: 'timeout' })), 45000);
      job.promise = execute(request, controller.signal).then((result) => {
        if (result.success) {
          if (cache.size >= 100) cache.delete(cache.keys().next().value);
          cache.set(key, { value: result, expires: now() + 300000 });
        }
        return result;
      }).finally(() => { clearTimeout(timer); inflight.delete(key); });
      inflight.set(key, job);
    }
    job.callers++;
    try {
      return await bounded(job.promise, callerSignal, 45000);
    } catch (error) {
      const reason = job.controller.signal.reason;
      return { success: false, status: reason?.code === 'timeout' ? 'timeout' : error.code || 'error', error: error.message, query: request.query, results: [] };
    } finally {
      job.callers--;
      if (job.callers === 0) job.controller.abort();
    }
  }
  return { search };
}

let instance;
function search(args, signal) {
  instance ||= createSearchService(require('../../browser-native/service.cjs').browser);
  return instance.search(args, signal);
}
module.exports = { search, SearchSchema, createSearchService };
