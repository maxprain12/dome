/**
 * DuckDuckGo HTML lite search (zero-config, no API key).
 */

const cheerio = require('cheerio');
const { fetchWithTimeout, mapSearchResults } = require('../http-utils.cjs');

function resolveDuckDuckGoRegion(country, searchLang) {
  const normalizedCountry = country || 'us';
  const normalizedLang = searchLang || 'en';
  return `${normalizedCountry.toLowerCase()}-${normalizedLang}`;
}

function resolveDuckDuckGoFreshness(freshness) {
  switch ((freshness || '').toLowerCase()) {
    case 'pd':
      return 'd';
    case 'pw':
      return 'w';
    case 'pm':
      return 'm';
    case 'py':
      return 'y';
    default:
      return '';
  }
}

function parseDdgHtml(html, count) {
  const $ = cheerio.load(html);
  const entries = [];

  $('.result, .web-result').each((_i, node) => {
    const root = $(node);
    const titleCandidates = [
      root.find('.result__title a').first(),
      root.find('.result__a').first(),
      root.find('h2 a').first(),
      root.find('a[href]').first(),
    ];
    const titleLink = titleCandidates.find((candidate) => candidate.length > 0) || titleCandidates[0];

    const href = titleLink.attr('href') || '';
    const title = titleLink.text().trim();
    const description =
      root.find('.result__snippet').first().text().trim() ||
      root.find('.result-snippet').first().text().trim() ||
      root.find('p').first().text().trim();
    const displayedUrl =
      root.find('.result__url').first().text().trim() ||
      root.find('.result__extras__url').first().text().trim() ||
      root.find('.result__hostname').first().text().trim();

    if (href || title) {
      entries.push({ title, url: href, description, displayedUrl });
    }
  });

  return mapSearchResults(entries, count);
}

async function search(request) {
  const searchUrl = new URL('https://html.duckduckgo.com/html/');
  searchUrl.searchParams.set('q', request.query);
  searchUrl.searchParams.set('kl', resolveDuckDuckGoRegion(request.country, request.searchLang));
  const freshness = resolveDuckDuckGoFreshness(request.freshness);
  if (freshness) searchUrl.searchParams.set('df', freshness);

  const response = await fetchWithTimeout(
    searchUrl.toString(),
    {
      method: 'GET',
      headers: {
        'User-Agent': request.userAgent,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': request.searchLang ? `${request.searchLang},en;q=0.5` : 'en-US,en;q=0.5',
      },
    },
    request.timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`DuckDuckGo HTTP ${response.status}`);
  }

  const html = await response.text();
  const results = parseDdgHtml(html, request.count);

  if (results.length === 0) {
    throw new Error('DuckDuckGo returned no parseable results');
  }

  return {
    success: true,
    provider: 'ddg',
    engine: 'duckduckgo',
    query: request.query,
    count: results.length,
    results,
  };
}

module.exports = { search };
