/**
 * Direct HTTP fetch + Mozilla Readability extraction.
 */

const { Readability } = require('@mozilla/readability');
const { parseHTML } = require('linkedom');
const { fetchPublicWithTimeout } = require('../url-guard.cjs');

async function readBoundedHtml(response, maxBytes, signal) {
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) throw new Error('page_size_limit_exceeded');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { await reader.cancel(); }
}

async function scrape(request) {
  const response = await fetchPublicWithTimeout(
    request.url,
    {
      method: 'GET', signal: request.signal,
      headers: {
        'User-Agent': request.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    },
    request.timeoutMs,
    request.validateTarget,
  );

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }

  const finalUrl = response.url || request.url;
  const html = request.maxBytes ? await readBoundedHtml(response, request.maxBytes, request.signal) : await response.text();
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
