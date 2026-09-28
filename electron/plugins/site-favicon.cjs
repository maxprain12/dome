'use strict';

const MAX_ICON_BYTES = 128 * 1024;
const ICON_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

function attr(tag, name) {
  const match = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : '';
}

function sameOriginHref(page, href) {
  let resolved;
  try {
    resolved = new URL(href, page);
  } catch {
    return null;
  }
  if (resolved.origin !== page.origin) return null;
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
  return resolved.toString();
}

function iconRank(rel) {
  const tokens = String(rel || '').toLowerCase().split(/\s+/);
  if (tokens.includes('apple-touch-icon')) return 1;
  if (tokens.includes('icon')) return 0;
  return 2;
}

function iconTargetsFromHtml(html, pageUrl) {
  const page = new URL(pageUrl);
  const found = [];
  const tagRe = /<link\b([^>]*)>/gi;
  let match = tagRe.exec(String(html || ''));
  while (match) {
    const rel = attr(match[1], 'rel');
    const href = attr(match[1], 'href');
    const rank = iconRank(rel);
    if (href && rank < 2) {
      const absolute = sameOriginHref(page, href);
      if (absolute) found.push({ href: absolute, rank });
    }
    match = tagRe.exec(String(html || ''));
  }
  found.sort((left, right) => left.rank - right.rank || left.href.localeCompare(right.href));
  const hrefs = [];
  for (const item of found) {
    if (!hrefs.includes(item.href)) hrefs.push(item.href);
  }
  const fallback = new URL('/favicon.ico', page.origin).toString();
  if (!hrefs.includes(fallback)) hrefs.push(fallback);
  return hrefs;
}

function imageMime(header) {
  const raw = String(header || '').split(';')[0].trim().toLowerCase();
  if (raw === 'image/jpg') return 'image/jpeg';
  if (raw === 'image/svg+xml') return null;
  return ICON_MIME.has(raw) ? raw : null;
}

function assertIconDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon));base64,([a-z0-9+/=\s]+)$/i.exec(String(dataUrl || '').trim());
  if (!match) throw new Error('Site icon must be a PNG, JPEG, WebP, GIF or ICO image');
  const mime = match[1].toLowerCase();
  const payload = match[2].replace(/\s/g, '');
  const bytes = Buffer.from(payload, 'base64');
  if (!bytes.length || bytes.length > MAX_ICON_BYTES) {
    throw new Error('Site icon must be 128 KB or smaller');
  }
  return `data:${mime};base64,${payload}`;
}

async function readHtml(fetchPublic, pageUrl) {
  try {
    const response = await fetchPublic(pageUrl, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    }, 8000);
    if (!response.ok) return '';
    const type = response.headers.get('content-type') || '';
    if (!type.includes('html')) return '';
    return (await response.text()).slice(0, 500_000);
  } catch {
    return '';
  }
}

async function detectSiteFavicon(siteUrl, fetchPublic) {
  let page;
  try {
    page = new URL(String(siteUrl || '').trim());
  } catch {
    throw new Error('Site URL must be an http(s) address');
  }
  if (page.protocol !== 'http:' && page.protocol !== 'https:') {
    throw new Error('Site URL must be an http(s) address');
  }
  if (page.username || page.password) throw new Error('Site URL must not include credentials');
  const load = fetchPublic || require('../services/web/url-guard.cjs').fetchPublicWithTimeout;
  const html = await readHtml(load, page.toString().replace(/\/+$/, '') || page.toString());
  const targets = iconTargetsFromHtml(html, page.toString());
  for (const target of targets) {
    try {
      const response = await load(target, { headers: { Accept: 'image/*' } }, 8000);
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      const mime = imageMime(response.headers.get('content-type'));
      if (!mime || !buffer.length || buffer.length > MAX_ICON_BYTES) continue;
      return { source: 'favicon', dataUrl: `data:${mime};base64,${buffer.toString('base64')}` };
    } catch {
      /* try the next candidate, including /favicon.ico */
    }
  }
  throw new Error('Could not detect a site icon');
}

module.exports = {
  assertIconDataUrl,
  detectSiteFavicon,
  iconTargetsFromHtml,
};
