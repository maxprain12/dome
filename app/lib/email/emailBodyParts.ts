export interface EmailContentParts {
  html: string | null;
  text: string;
}

const HTML_MIME_PREFIXES = new Set(['text/html']);
const PLAIN_MIME_PREFIXES = new Set(['text/plain']);

/** CSS injected into every email iframe so fixed-width campaigns fit the panel. */
const EMAIL_CONTAIN_CSS = `
html, body {
  margin: 0;
  padding: 12px;
  width: 100% !important;
  max-width: 100% !important;
  overflow-x: hidden !important;
  overflow-wrap: anywhere;
  word-break: break-word;
  box-sizing: border-box;
}
*, *::before, *::after { box-sizing: border-box; }
img, svg, video, canvas, iframe {
  max-width: 100% !important;
  height: auto !important;
}
table {
  width: 100% !important;
  max-width: 100% !important;
}
td, th {
  word-break: break-word;
  overflow-wrap: anywhere;
  max-width: 100% !important;
}
/* Campaign HTML often sets width="600" / style="width:600px" — clamp to the pane. */
[width], [style*='width'] {
  max-width: 100% !important;
}
pre, code {
  max-width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
}
`.trim();

const EMAIL_HEAD_INJECT = `<meta name="viewport" content="width=device-width, initial-scale=1"><style id="dome-email-contain">${EMAIL_CONTAIN_CSS}</style>`;

function isHtmlType(type: string): boolean {
  const lower = type.toLowerCase();
  if (HTML_MIME_PREFIXES.has(lower)) return true;
  return lower.includes('html');
}

function isPlainType(type: string): boolean {
  const lower = type.toLowerCase();
  if (PLAIN_MIME_PREFIXES.has(lower)) return true;
  return lower.includes('plain') || lower.startsWith('text/');
}

/** Pull the raw body string out of legacy himalaya `message read` output (string or object). */
export function extractRawBody(message: unknown): string {
  if (message == null) return '';
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.map(extractRawBody).filter(Boolean).join('\n');
  const m = message as Record<string, unknown>;
  const pick = (k: string) => (typeof m[k] === 'string' ? (m[k] as string) : '');
  const nested =
    pick('text') ||
    pick('body') ||
    pick('plain') ||
    pick('content') ||
    pick('raw') ||
    pick('html');
  if (nested) return nested;
  if (m.content && typeof m.content === 'object') return extractRawBody(m.content);
  if (m.payload && typeof m.payload === 'object') return extractRawBody(m.payload);
  return '';
}

/** Normalize IPC payload `{ html, plain, text }` or legacy string/MML into render parts. */
export function extractEmailParts(message: unknown): EmailContentParts {
  if (message != null && typeof message === 'object' && !Array.isArray(message)) {
    const m = message as Record<string, unknown>;
    const html = typeof m.html === 'string' && m.html.trim() ? m.html.trim() : null;
    const text =
      (typeof m.plain === 'string' ? m.plain : '') ||
      (typeof m.text === 'string' ? m.text : '') ||
      (typeof m.body === 'string' ? m.body : '');
    if (html || text.trim()) return { html, text: text.trim() };
  }
  const raw = extractRawBody(message);
  if (!raw) return { html: null, text: '' };
  return parseMmlParts(raw);
}

/** Strip himalaya MML part delimiters (<#part …>, <#/part>, <#multipart …>, <#/multipart>). */
export function stripMmlMarkers(body: string): string {
  return body
    .split(/\r?\n/)
    .filter((line) => !/^\s*<#\/?(?:part|multipart)\b[^>]*>\s*$/i.test(line))
    .join('\n')
    .trim();
}

/** Parse MML multipart and return preferred HTML and/or plain text parts. */
export function parseMmlParts(body: string): EmailContentParts {
  const htmlParts: string[] = [];
  const textParts: string[] = [];
  const re = /<#part\s+type=(?:"([^"]+)"|([^\s>]+))[^>]*>\s*([\s\S]*?)\s*<#\/part>/gi;
  for (const match of body.matchAll(re)) {
    const type = (match[1] || match[2] || '').toLowerCase();
    const content = match[3].trim();
    if (isHtmlType(type)) htmlParts.push(content);
    else if (isPlainType(type)) textParts.push(content);
  }
  if (htmlParts.length === 0 && textParts.length === 0) {
    const stripped = stripMmlMarkers(body);
    if (looksLikeHtml(stripped)) return { html: stripped, text: '' };
    return { html: null, text: stripped };
  }
  return {
    html: htmlParts.length ? htmlParts.join('\n') : null,
    text: textParts.join('\n\n'),
  };
}

function looksLikeHtml(body: string): boolean {
  return /<\s*(html|body|div|table|p|a|img|span|br|h[1-6]|ul|ol|center|font|style)\b/i.test(body);
}

/** Inject viewport + containment CSS into a full HTML document (or no-op if already present). */
export function injectEmailContainment(htmlDocument: string): string {
  if (htmlDocument.includes('id="dome-email-contain"')) return htmlDocument;
  if (/<\s*head[^>]*>/i.test(htmlDocument)) {
    return htmlDocument.replace(/<\s*head([^>]*)>/i, `<head$1>${EMAIL_HEAD_INJECT}`);
  }
  if (/<\s*html[^>]*>/i.test(htmlDocument)) {
    return htmlDocument.replace(/<\s*html([^>]*)>/i, `<html$1><head>${EMAIL_HEAD_INJECT}</head>`);
  }
  return `<!doctype html><html><head>${EMAIL_HEAD_INJECT}</head><body>${htmlDocument}</body></html>`;
}

/** Wrap partial HTML fragments in a document shell for iframe rendering. */
export function wrapEmailHtml(htmlBody: string): string {
  const trimmed = htmlBody.trim();
  const hasDocument = /<\s*html[\s>]/i.test(trimmed);
  if (hasDocument) return injectEmailContainment(trimmed);
  return `<!doctype html><html><head><meta charset="utf-8">
    <base target="_blank">
    ${EMAIL_HEAD_INJECT}
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
           color:#1a1a1a;background:#ffffff;font-size:14px;line-height:1.5}
      a{color:#3b5bdb}
    </style></head><body>${trimmed}</body></html>`;
}
