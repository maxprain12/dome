/**
 * SearXNG public instance search (zero-config, no API key).
 */

const { fetchWithTimeout, mapSearchResults } = require('../http-utils.cjs');

const SEARXNG_INSTANCES = [
  'https://searx.be',
  'https://search.bus-hit.me',
  'https://paulgo.io',
  'https://search.sapti.me',
  'https://searx.tiekoetter.com',
];

let instanceCursor = 0;

function nextInstances() {
  const rotated = [];
  for (let i = 0; i < SEARXNG_INSTANCES.length; i += 1) {
    rotated.push(SEARXNG_INSTANCES[(instanceCursor + i) % SEARXNG_INSTANCES.length]);
  }
  instanceCursor = (instanceCursor + 1) % SEARXNG_INSTANCES.length;
  return rotated;
}

async function searchOnInstance(baseUrl, request) {
  const searchUrl = new URL('/search', baseUrl);
  searchUrl.searchParams.set('q', request.query);
  searchUrl.searchParams.set('format', 'json');
  searchUrl.searchParams.set('language', request.searchLang || 'en');

  const response = await fetchWithTimeout(
    searchUrl.toString(),
    {
      method: 'GET',
      headers: {
        'User-Agent': request.userAgent,
        Accept: 'application/json',
      },
      signal: request.signal,
    },
    request.timeoutMs,
  );

  if (!response.ok) {
    const retry = response.headers.get('retry-after');
    const retryAfterMs = response.status === 429 ? Math.max(300_000, Number(retry) * 1000 || Date.parse(retry) - Date.now() || 0) : 0;
    throw Object.assign(new Error(`SearXNG HTTP ${response.status} at ${baseUrl}`), { retryAfterMs });
  }

  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`SearXNG returned an HTML challenge or invalid JSON at ${baseUrl}`); }
  if (!Array.isArray(payload?.results)) throw new Error(`SearXNG search results missing at ${baseUrl}`);
  const rawResults = payload.results;
  const entries = rawResults.map((item) => ({
    title: item.title || item.url || '',
    url: item.url || '',
    description: item.content || item.snippet || '',
    displayedUrl: item.pretty_url || item.url || '',
  }));

  const results = mapSearchResults(entries, request.count);
  return {
    success: true,
    provider: 'searxng',
    engine: new URL(baseUrl).hostname,
    query: request.query,
    count: results.length,
    results,
  };
}

async function search(request) {
  const errors = [];
  let retryAfterMs = 0;

  for (const baseUrl of nextInstances()) {
    request.signal?.throwIfAborted();
    try {
      return await searchOnInstance(baseUrl, request);
    } catch (error) {
      request.signal?.throwIfAborted();
      retryAfterMs = Math.max(retryAfterMs, error.retryAfterMs || 0);
      errors.push(`${baseUrl}: ${error?.message || String(error)}`);
    }
  }

  throw Object.assign(new Error(errors.join('; ') || 'All SearXNG instances failed'), { retryAfterMs });
}

module.exports = { search };
