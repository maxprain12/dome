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
    },
    request.timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`SearXNG HTTP ${response.status} at ${baseUrl}`);
  }

  const payload = await response.json();
  const rawResults = Array.isArray(payload?.results) ? payload.results : [];
  const entries = rawResults.map((item) => ({
    title: item.title || item.url || '',
    url: item.url || '',
    description: item.content || item.snippet || '',
    displayedUrl: item.pretty_url || item.url || '',
  }));

  const results = mapSearchResults(entries, request.count);
  if (results.length === 0) {
    throw new Error(`SearXNG returned no results at ${baseUrl}`);
  }

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

  for (const baseUrl of nextInstances()) {
    try {
      return await searchOnInstance(baseUrl, request);
    } catch (error) {
      errors.push(`${baseUrl}: ${error?.message || String(error)}`);
    }
  }

  throw new Error(errors.join('; ') || 'All SearXNG instances failed');
}

module.exports = { search };
