/**
 * Direct HTTP fetch + Mozilla Readability extraction.
 */

const { Readability } = require('@mozilla/readability');
const { parseHTML } = require('linkedom');
const { fetchWithTimeout } = require('../http-utils.cjs');

async function scrape(request) {
  const response = await fetchWithTimeout(
    request.url,
    {
      method: 'GET',
      headers: {
        'User-Agent': request.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    },
    request.timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }

  const finalUrl = response.url || request.url;
  const html = await response.text();
  const { document } = parseHTML(html);
  const reader = new Readability(document);
  const article = reader.parse();

  let content = article?.textContent?.trim() || '';
  let title = article?.title || document.querySelector('title')?.textContent?.trim() || finalUrl;

  if (request.selector) {
    const selected = document.querySelector(request.selector);
    if (selected) {
      content = selected.textContent?.trim() || content;
    }
  }

  if (!content) {
    content = document.body?.textContent?.trim() || '';
  }

  if (!content) {
    throw new Error('Readability could not extract content from page');
  }

  return {
    success: true,
    url: finalUrl,
    finalUrl,
    title,
    content: content.slice(0, request.maxLength),
    metadata: request.includeMetadata
      ? {
          title,
          description:
            document.querySelector('meta[name="description"]')?.getAttribute('content') ||
            document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
            undefined,
          author:
            document.querySelector('meta[name="author"]')?.getAttribute('content') ||
            article?.byline ||
            undefined,
          siteName:
            document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
            new URL(finalUrl).hostname,
          url: finalUrl,
        }
      : undefined,
    screenshot: null,
    screenshotFormat: 'jpeg',
    warnings: [],
    provider: 'readability',
  };
}

module.exports = { scrape };
