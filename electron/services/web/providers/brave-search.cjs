/**
 * Brave Search API (requires free API key).
 */

const { fetchWithTimeout, mapSearchResults } = require('../http-utils.cjs');

async function search(request, apiKey) {
  if (!apiKey) {
    throw new Error('Brave Search API key is not configured');
  }

  const searchUrl = new URL('https://api.search.brave.com/res/v1/web/search');
  searchUrl.searchParams.set('q', request.query);
  searchUrl.searchParams.set('count', String(request.count));
  if (request.country) {
    searchUrl.searchParams.set('country', request.country.toLowerCase());
  }
  if (request.searchLang) {
    searchUrl.searchParams.set('search_lang', request.searchLang);
  }

  const response = await fetchWithTimeout(
    searchUrl.toString(),
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    },
    request.timeoutMs,
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Brave HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }

  const payload = await response.json();
  const rawResults = Array.isArray(payload?.web?.results) ? payload.web.results : [];
  const entries = rawResults.map((item) => ({
    title: item.title || item.url || '',
    url: item.url || '',
    description: item.description || '',
    displayedUrl: item.url || '',
  }));

  const results = mapSearchResults(entries, request.count);
  if (results.length === 0) {
    throw new Error('Brave Search returned no results');
  }

  return {
    success: true,
    provider: 'brave',
    engine: 'brave',
    query: request.query,
    count: results.length,
    results,
  };
}

module.exports = { search };
