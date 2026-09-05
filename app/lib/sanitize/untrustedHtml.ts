/**
 * Conservative sanitizer for untrusted markup (DOCX/mammoth, notebook SVG/HTML).
 * Strips active sinks; keeps presentational tags used by document/notebook output.
 */
const BLOCKED_TAGS = /<\/?(?:script|iframe|object|embed|link|meta|base|form|math|svg)(?:[\s/>]|>)/gi;
const BLOCKED_BLOCKS =
  /<(script|iframe|object|embed|link|meta|base|form|math)\b[\s\S]*?<\/\1\s*>/gi;
const EVENT_ATTR = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL = /(?:href|src|xlink:href|action)\s*=\s*(['"]?)\s*javascript:/gi;

export function sanitizeUntrustedHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(BLOCKED_BLOCKS, '')
    .replace(BLOCKED_TAGS, '')
    .replace(EVENT_ATTR, '')
    .replace(JS_URL, 'data-blocked=');
}
