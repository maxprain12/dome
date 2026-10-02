'use strict';

const { resolveSearchResultUrl } = require('./http-utils.cjs');

const ENGINES = ['duckduckgo', 'bing', 'google'];
function searchUrl(engine, request) {
  const query = request.query;
  const urls = {
    duckduckgo: 'https://duckduckgo.com/?q=',
    bing: 'https://www.bing.com/search?q=',
    google: 'https://www.google.com/search?q=',
  };
  const url = new URL(urls[engine] + encodeURIComponent(query));
  if (request.search_lang) url.searchParams.set(engine === 'google' ? 'hl' : 'setlang', request.search_lang);
  if (request.country) url.searchParams.set(engine === 'google' ? 'gl' : 'cc', request.country);
  if (request.freshness) {
    const period = { day: 'd', week: 'w', month: 'm', year: 'y' }[request.freshness];
    if (engine === 'duckduckgo') url.searchParams.set('df', period);
    if (engine === 'google') url.searchParams.set('tbs', `qdr:${period}`);
    if (engine === 'bing') url.searchParams.set('filters', `ex1:"${{ day: 'ez1', week: 'ez2', month: 'ez3', year: 'ez5' }[request.freshness]}"`);
  }
  return url.toString();
}

// Runs in the remote page, with no Node APIs or app preload.
function inspectSearchPage(engine) {
  const text = document.body?.innerText || '';
  const challenge = document.querySelector('iframe[src*="captcha"], #captcha, #challenge-form, form[action*="anomaly"], .g-recaptcha, #b_captcha') ||
    /unusual traffic|verify you are human|prove you.re human|unfortunately, bots use duckduckgo|complete the following challenge/i.test(text);
  if (challenge) return { status: 'captcha', entries: [] };
  const selectors = {
    duckduckgo: '[data-testid="result"], .result',
    bing: '#b_results > .b_algo',
    google: '#search div.MjjYud',
  };
  const entries = Array.from(document.querySelectorAll(selectors[engine])).flatMap((node) => {
    const heading = node.querySelector(engine === 'duckduckgo' ? '[data-testid="result-title-a"], .result__a' : engine === 'google' ? 'h3' : 'h2');
    const anchor = heading?.closest('a') || heading?.querySelector('a');
    if (!anchor?.href || !heading?.textContent?.trim()) return [];
    const snippet = node.querySelector('[data-result="snippet"], [data-testid="result-snippet"], .result__snippet, .b_caption p, .VwiC3b');
    return [{ title: heading.textContent.trim(), url: anchor.href, description: snippet?.textContent?.trim() || '' }];
  });
  if (entries.length) return { status: 'success', entries };
  if (/no results found|no results for|did not match any documents|there are no results|no se encontraron resultados/i.test(text)) return { status: 'empty', entries: [] };
  return { status: 'page_changed', entries: [] };
}

function normalizeResults(entries, count) {
  const seen = new Set();
  return entries.flatMap((entry) => {
    try {
      let raw = resolveSearchResultUrl(entry.url);
      const wrapped = new URL(raw);
      if (/(^|\.)google\.[a-z.]+$/.test(wrapped.hostname) && wrapped.pathname === '/url') raw = wrapped.searchParams.get('q') || wrapped.searchParams.get('url') || raw;
      const url = new URL(raw);
      if (!['https:', 'http:'].includes(url.protocol) || /(^|\.)(duckduckgo\.com|bing\.com|google\.[a-z.]+)$/.test(url.hostname)) return [];
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) if (/^utm_|^(gclid|fbclid)$/.test(key)) url.searchParams.delete(key);
      const canonical = url.toString();
      if (seen.has(canonical)) return [];
      seen.add(canonical);
      return [{ title: entry.title.slice(0, 500), url: canonical, description: String(entry.description || '').slice(0, 2000), siteName: url.hostname.replace(/^www\./, '') }];
    } catch { return []; }
  }).slice(0, count);
}

module.exports = { ENGINES, searchUrl, inspectSearchPage, normalizeResults };
