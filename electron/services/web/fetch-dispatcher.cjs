/**
 * Orchestrates web page fetching across configurable HTTP providers.
 */

const { getWebSettings } = require('./web-settings.cjs');
const { normalizeFetchRequest } = require('./http-utils.cjs');
const { assertPublicUrl, fetchPublicWithTimeout } = require('./url-guard.cjs');
const jinaReader = require('./providers/jina-reader.cjs');
const readabilityFetch = require('./providers/readability-fetch.cjs');
const tavilyExtract = require('./providers/tavily-extract.cjs');

const API_DOMAINS = [
  'firebaseio.com',
  'api.github.com',
  'api.twitter.com',
  'api.reddit.com',
  'newsapi.org',
  'api.the-odds-api.com',
];

const API_PATTERNS = [
  /\/v\d+\/.*\.json$/i,
  /\/api\//i,
  /\.json$/i,
  /\/v0\/.*\.json$/i,
  /\/graphql$/i,
  /\/rest\//i,
];

function isLikelyApiUrl(url) {
  try {
    const parsed = new URL(url);
    if (API_DOMAINS.some((domain) => parsed.hostname.includes(domain))) {
      return true;
    }
    return API_PATTERNS.some((pattern) => pattern.test(parsed.pathname));
  } catch {
    return false;
  }
}

async function fetchApiResponse(request) {
  await assertPublicUrl(request.url);
  const response = await fetchPublicWithTimeout(
    request.url,
    {
      method: 'GET',
      headers: {
        'User-Agent': request.userAgent,
        Accept: 'application/json,text/json,*/*',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    },
    request.timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();
  let formattedBody = body;

  if (contentType.includes('application/json')) {
    try {
      formattedBody = JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      // keep raw body
    }
  }

  const finalUrl = response.url || request.url;

  return {
    success: true,
    url: finalUrl,
    finalUrl,
    title: finalUrl,
    content: formattedBody.slice(0, request.maxLength),
    metadata: request.includeMetadata
      ? {
          title: finalUrl,
          description: undefined,
          author: undefined,
          siteName: new URL(finalUrl).hostname,
          url: finalUrl,
          contentType,
        }
      : undefined,
    screenshot: null,
    screenshotFormat: 'jpeg',
    warnings: [],
    provider: 'fetch',
  };
}

function buildProviderChain(settings) {
  const chain = [];

  const pushUnique = (id) => {
    if (!chain.includes(id)) chain.push(id);
  };

  switch (settings.fetchProvider) {
    case 'tavily':
      pushUnique('tavily');
      break;
    case 'jina':
      pushUnique('jina');
      break;
    case 'readability':
      pushUnique('readability');
      break;
    case 'auto':
    default:
      if (settings.tavilyKey) pushUnique('tavily');
      pushUnique('jina');
      pushUnique('readability');
      break;
  }

  return chain;
}

async function runProvider(providerId, request, settings) {
  switch (providerId) {
    case 'tavily':
      return tavilyExtract.scrape(request, settings.tavilyKey);
    case 'jina':
      return jinaReader.scrape(request);
    case 'readability':
      return readabilityFetch.scrape(request);
    default:
      throw new Error(`Unknown fetch provider: ${providerId}`);
  }
}

async function scrapeUrl(input) {
  let request;
  try {
    request = normalizeFetchRequest(input);
  } catch (error) {
    return {
      success: false,
      url: '',
      error: error?.message || String(error),
      title: null,
      content: null,
      metadata: {},
      screenshot: null,
      screenshotFormat: 'jpeg',
    };
  }

  if (!request.url || typeof request.url !== 'string') {
    return {
      success: false,
      url: '',
      error: 'Invalid URL: missing url',
      title: null,
      content: null,
      metadata: {},
      screenshot: null,
      screenshotFormat: 'jpeg',
    };
  }

  try {
    new URL(request.url);
  } catch {
    return {
      success: false,
      url: request.url,
      error: `Invalid URL: ${request.url}`,
      title: null,
      content: null,
      metadata: { url: request.url },
      screenshot: null,
      screenshotFormat: 'jpeg',
    };
  }

  try {
    await assertPublicUrl(request.url);
  } catch (error) {
    return {
      success: false,
      url: request.url,
      error: error?.message || String(error),
      title: null,
      content: null,
      metadata: { url: request.url },
      screenshot: null,
      screenshotFormat: 'jpeg',
    };
  }

  if (isLikelyApiUrl(request.url)) {
    try {
      return await fetchApiResponse(request);
    } catch (error) {
      return {
        success: false,
        url: request.url,
        error: error?.message || String(error),
        title: null,
        content: null,
        metadata: { url: request.url },
        screenshot: null,
        screenshotFormat: 'jpeg',
      };
    }
  }

  if (request.includeScreenshot) {
    // Screenshots require a headless browser; HTTP providers cannot render JS pages.
  }

  const settings = getWebSettings();
  const chain = buildProviderChain(settings);
  const errors = [];

  for (const providerId of chain) {
    try {
      const result = await runProvider(providerId, request, settings);
      if (request.includeScreenshot) {
        result.warnings = [
          ...(Array.isArray(result.warnings) ? result.warnings : []),
          'include_screenshot is not supported without a headless browser; screenshot omitted.',
        ];
      }
      return result;
    } catch (error) {
      errors.push(`${providerId}: ${error?.message || String(error)}`);
    }
  }

  return {
    success: false,
    url: request.url,
    error: errors.join('; ') || 'All fetch providers failed',
    title: null,
    content: null,
    metadata: { url: request.url },
    screenshot: null,
    screenshotFormat: 'jpeg',
  };
}

module.exports = {
  scrapeUrl,
  buildProviderChain,
};
