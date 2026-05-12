'use strict';

const https = require('node:https');
const { URL } = require('node:url');

/** Official LangChain / LangSmith documentation index (Markdown links list). */
const LLMS_TXT_URL = 'https://docs.langchain.com/llms.txt';

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_INDEX_BYTES = 8 * 1024 * 1024;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;

/** @type {{ body: string | null; fetchedAt: number }} */
const indexCache = { body: null, fetchedAt: 0 };

/**
 * @param {string} url
 * @param {number} maxBytes
 * @returns {Promise<string>}
 */
function fetchText(url, maxBytes) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      reject(e);
      return;
    }
    if (u.protocol !== 'https:') {
      reject(new Error('Only HTTPS URLs are supported'));
      return;
    }
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: `${u.pathname}${u.search}`,
      method: 'GET',
      headers: { 'user-agent': 'Dome/2 (langchain docs helper)' },
      timeout: 45_000,
    };
    const req = https.request(opts, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks = [];
      let len = 0;
      res.on('data', (c) => {
        len += c.length;
        if (len > maxBytes) {
          res.destroy();
          reject(new Error('Response too large'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * @param {{ forceRefresh?: boolean; query?: string; maxLines?: number }} [opts]
 */
async function getLangchainDocsIndex(opts = {}) {
  const now = Date.now();
  const force = Boolean(opts.forceRefresh);
  const stale = !indexCache.body || now - indexCache.fetchedAt > CACHE_TTL_MS;
  if (force || stale) {
    indexCache.body = await fetchText(LLMS_TXT_URL, MAX_INDEX_BYTES);
    indexCache.fetchedAt = now;
  }
  const body = indexCache.body || '';
  const q = typeof opts.query === 'string' ? opts.query.trim().toLowerCase() : '';
  let lines = body.split('\n');
  const totalBeforeFilter = lines.length;
  if (q) {
    lines = lines.filter((line) => line.toLowerCase().includes(q));
  }
  const maxLines = Math.min(Math.max(1, Number(opts.maxLines) || 500), 2500);
  const truncated = lines.length > maxLines;
  const slice = truncated ? lines.slice(0, maxLines) : lines;
  return {
    status: 'success',
    source: LLMS_TXT_URL,
    total_lines_in_index: totalBeforeFilter,
    lines_after_query_filter: lines.length,
    returned_lines: slice.length,
    truncated,
    cache_fetched_at: new Date(indexCache.fetchedAt).toISOString(),
    index_markdown: slice.join('\n'),
  };
}

/**
 * @param {string} urlStr
 * @returns {boolean}
 */
function isAllowedLangchainDocUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return false;
    if (u.hostname !== 'docs.langchain.com') return false;
    if (!u.pathname || u.pathname === '/') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} urlStr
 */
async function fetchLangchainDocsPage(urlStr) {
  const url = typeof urlStr === 'string' ? urlStr.trim() : '';
  if (!url) return { status: 'error', error: 'url is required' };
  if (!isAllowedLangchainDocUrl(url)) {
    return {
      status: 'error',
      error: 'Only https://docs.langchain.com/... documentation URLs from the llms.txt index are allowed.',
    };
  }
  try {
    const content = await fetchText(url, MAX_PAGE_BYTES);
    return {
      status: 'success',
      url,
      length: content.length,
      content,
    };
  } catch (e) {
    return { status: 'error', error: e?.message || String(e) };
  }
}

module.exports = {
  LLMS_TXT_URL,
  getLangchainDocsIndex,
  fetchLangchainDocsPage,
};
