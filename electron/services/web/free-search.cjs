'use strict';

function unavailable(provider, retryAfterMs) {
  return Object.assign(new Error(`${provider}: public search is unavailable. Use existing evidence, wait, or explicitly configure a search provider; this is not a zero-results search.`), {
    code: 'search_unavailable', retryAfterMs, retryable: false,
  });
}

/** Shared by web_search and research_search; failed public providers are not hammered. */
function createFreeSearch({ providers, now = Date.now, cooldownMs = 60_000 } = {}) {
  providers ||= { searxng: require('./providers/searxng.cjs'), ddg: require('./providers/ddg-html.cjs') };
  const states = new Map();
  function searchProvider(name, request) {
    if (!states.has(name)) states.set(name, { until: 0, pending: Promise.resolve() });
    const state = states.get(name);
    const operation = state.pending.then(async () => {
      request.signal?.throwIfAborted();
      if (state.until > now()) throw unavailable(name, state.until - now());
      try {
        const signal = request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(request.timeoutMs || 15000)]) : AbortSignal.timeout(request.timeoutMs || 15000);
        return await providers[name].search({ ...request, signal });
      } catch (error) {
        request.signal?.throwIfAborted();
        const delay = Math.max(cooldownMs, Number(error?.retryAfterMs) || 0);
        state.until = now() + delay;
        throw unavailable(name, delay);
      }
    });
    state.pending = operation.catch(() => undefined);
    return operation;
  }
  async function search(request) {
    let retryAfterMs = 0;
    for (const name of ['searxng', 'ddg']) {
      request.signal?.throwIfAborted();
      try { return await searchProvider(name, request); }
      catch (error) {
        request.signal?.throwIfAborted();
        retryAfterMs = Math.max(retryAfterMs, error.retryAfterMs || 0);
      }
    }
    throw unavailable('Public providers', retryAfterMs);
  }
  return { search, searchProvider };
}

const shared = createFreeSearch();
module.exports = { createFreeSearch, ...shared };
