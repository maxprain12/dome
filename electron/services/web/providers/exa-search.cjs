
'use strict';
const { fetchWithTimeout, mapSearchResults } = require('../http-utils.cjs');
async function search(request, apiKey) {
  if (!apiKey) throw new Error('Exa API key is not configured');
  const response = await fetchWithTimeout('https://api.exa.ai/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ query: request.query, type: 'auto', numResults: Math.min(request.count, 10) }),
    signal: request.signal,
  }, request.timeoutMs);
  if (!response.ok) throw new Error(`Exa HTTP ${response.status}`);
  const payload = await response.json();
  const results = mapSearchResults((payload.results || []).map((item) => ({
    title: item.title || item.url, url: item.url, description: item.text || '',
  })), request.count);
  return { success: true, provider: 'exa', engine: 'exa', query: request.query, count: results.length, results };
}
module.exports = { search };
