'use strict';

function escapeMdLinkText(value) {
  return String(value || '')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function formatWebCitation({ text, title, url, capturedAt } = {}) {
  const excerpt = String(text || '').trim();
  if (!excerpt) return '';
  const quoted = excerpt
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
  const day = new Date(typeof capturedAt === 'number' ? capturedAt : Date.now())
    .toISOString()
    .slice(0, 10);
  const href = String(url || '').trim();
  const label = escapeMdLinkText(String(title || '').trim() || href);
  const source = href ? `[${label}](${href})` : label;
  return `\n\n${quoted}\n>\n> — ${source} (${day})\n`;
}

module.exports = { formatWebCitation, escapeMdLinkText };
