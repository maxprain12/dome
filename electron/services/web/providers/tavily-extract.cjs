/**
 * Tavily Extract API (requires free API key).
 */

const { fetchWithTimeout } = require('../http-utils.cjs');
const { assertPublicUrl } = require('../url-guard.cjs');

async function scrape(request, apiKey) {
  if (!apiKey) {
    throw new Error('Tavily API key is not configured');
  }

  await assertPublicUrl(request.url);

  const response = await fetchWithTimeout(
    'https://api.tavily.com/extract',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        urls: [request.url],
      }),
    },
    request.timeoutMs,
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Tavily Extract HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }

  const payload = await response.json();
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const first = results[0];
  const content = String(first?.raw_content || first?.content || '').trim();

  if (!content) {
    throw new Error('Tavily Extract returned no content');
  }

  const finalUrl = first?.url || request.url;
  const title = first?.title || finalUrl;

  return {
    success: true,
    url: request.url,
    finalUrl,
    title,
    content: content.slice(0, request.maxLength),
    metadata: request.includeMetadata
      ? {
          title,
          description: undefined,
          author: undefined,
          siteName: new URL(finalUrl).hostname,
          url: finalUrl,
        }
      : undefined,
    screenshot: null,
    screenshotFormat: 'jpeg',
    warnings: [],
    provider: 'tavily',
  };
}

module.exports = { scrape };
