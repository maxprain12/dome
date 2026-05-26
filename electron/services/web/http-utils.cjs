/**
 * Shared HTTP helpers for web search/fetch providers.
 */

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

const DEFAULT_SEARCH_RESULT_COUNT = 5;

function normalizeSearchRequest(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid search request');
  }

  return {
    query: typeof input.query === 'string' ? input.query.trim() : '',
    count: Math.min(
      Math.max(1, Number.parseInt(String(input.count ?? DEFAULT_SEARCH_RESULT_COUNT), 10) || DEFAULT_SEARCH_RESULT_COUNT),
      10,
    ),
    country: typeof input.country === 'string' ? input.country.trim().toUpperCase() : '',
    searchLang: typeof input.searchLang === 'string' ? input.searchLang.trim().toLowerCase() : '',
    freshness: typeof input.freshness === 'string' ? input.freshness.trim().toLowerCase() : '',
    timeoutMs: Math.min(
      Math.max(5000, Number.parseInt(String(input.timeoutMs ?? 15000), 10) || 15000),
      120000,
    ),
    userAgent: typeof input.userAgent === 'string' ? input.userAgent : DEFAULT_USER_AGENT,
  };
}

function normalizeFetchRequest(input) {
  if (typeof input === 'string') {
    return {
      url: input,
      includeScreenshot: false,
      includeMetadata: true,
      maxLength: 50000,
      selector: undefined,
      timeoutMs: 30000,
      userAgent: DEFAULT_USER_AGENT,
    };
  }

  if (!input || typeof input !== 'object') {
    throw new Error('Invalid scrape request');
  }

  const maxLength = Math.min(
    Math.max(1000, Number.parseInt(String(input.maxLength ?? 50000), 10) || 50000),
    100000,
  );

  return {
    url: input.url,
    selector: typeof input.selector === 'string' ? input.selector : undefined,
    includeScreenshot: input.includeScreenshot === true,
    includeMetadata: input.includeMetadata !== false,
    maxLength,
    timeoutMs: Math.min(
      Math.max(5000, Number.parseInt(String(input.timeoutMs ?? 30000), 10) || 30000),
      120000,
    ),
    userAgent: typeof input.userAgent === 'string' ? input.userAgent : DEFAULT_USER_AGENT,
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function resolveSearchSiteName(url) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function resolveSearchResultUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl, 'https://duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');
    if (uddg) {
      return decodeURIComponent(uddg);
    }
    if (parsed.hostname.endsWith('bing.com') && parsed.pathname.startsWith('/ck/')) {
      const encoded = parsed.searchParams.get('u');
      if (encoded) {
        const normalized = encoded.startsWith('a1')
          ? encoded.slice(2)
          : encoded.startsWith('a')
            ? encoded.slice(1)
            : encoded;
        try {
          return Buffer.from(normalized, 'base64url').toString('utf8');
        } catch {
          // fall through
        }
      }
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // fall through
  }
  return rawUrl;
}

function mapSearchResults(entries, max) {
  return entries
    .slice(0, max)
    .map((entry) => {
      const url = resolveSearchResultUrl(entry.url);
      return {
        title: entry.title || url,
        url,
        description: entry.description || '',
        displayedUrl: entry.displayedUrl || url,
        siteName: resolveSearchSiteName(url),
      };
    })
    .filter((entry) => Boolean(entry.url));
}

module.exports = {
  DEFAULT_USER_AGENT,
  DEFAULT_SEARCH_RESULT_COUNT,
  normalizeSearchRequest,
  normalizeFetchRequest,
  fetchWithTimeout,
  resolveSearchSiteName,
  resolveSearchResultUrl,
  mapSearchResults,
};
