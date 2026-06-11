/**
 * Jina Reader — zero-config URL-to-markdown proxy.
 */

const { fetchWithTimeout } = require('../http-utils.cjs');
const { assertPublicUrl } = require('../url-guard.cjs');

async function scrape(request) {
  await assertPublicUrl(request.url);
  const readerUrl = `https://r.jina.ai/${request.url}`;

  const response = await fetchWithTimeout(
    readerUrl,
    {
      method: 'GET',
      headers: {
        Accept: 'text/plain, text/markdown, */*',
        'User-Agent': request.userAgent,
      },
    },
    request.timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`Jina Reader HTTP ${response.status}`);
  }

  const content = (await response.text()).trim();
  if (!content) {
    throw new Error('Jina Reader returned empty content');
  }

  const finalUrl = response.url?.replace(/^https:\/\/r\.jina\.ai\//, '') || request.url;
  let title = request.url;
  const titleMatch = content.match(/^Title:\s*(.+)$/m);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

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
          siteName: new URL(request.url).hostname,
          url: request.url,
        }
      : undefined,
    screenshot: null,
    screenshotFormat: 'jpeg',
    warnings: [],
    provider: 'jina',
  };
}

module.exports = { scrape };
