/**
 * Tavily Search API (requires free API key).
 */

const { fetchWithTimeout, mapSearchResults } = require('../http-utils.cjs');

async function search(request, apiKey) {
  if (!apiKey) {
    throw new Error('Tavily API key is not configured');
  }

  const response = await fetchWithTimeout(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: request.query,
        max_results: request.count,
        include_answer: false,
        search_depth: 'basic',
      }),
    },
    request.timeoutMs,
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Tavily HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }

  const payload = await response.json();
  const rawResults = Array.isArray(payload?.results) ? payload.results : [];
  const entries = rawResults.map((item) => ({
    title: item.title || item.url || '',
    url: item.url || '',
    description: item.content || item.snippet || '',
    displayedUrl: item.url || '',
  }));

  const results = mapSearchResults(entries, request.count);
  if (results.length === 0) {
    throw new Error('Tavily returned no results');
  }

  return {
    success: true,
    provider: 'tavily',
    engine: 'tavily',
    query: request.query,
    count: results.length,
    results,
  };
}

module.exports = { search };
