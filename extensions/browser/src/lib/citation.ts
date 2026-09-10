export function formatWebCitation(opts: {
  text?: string;
  title?: string;
  url?: string;
  capturedAt?: number;
}): string {
  const excerpt = String(opts.text || '').trim();
  if (!excerpt) return '';
  const quoted = excerpt
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
  const day = new Date(typeof opts.capturedAt === 'number' ? opts.capturedAt : Date.now())
    .toISOString()
    .slice(0, 10);
  const href = String(opts.url || '').trim();
  const label = String(opts.title || '').trim() || href;
  const escaped = label.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  const source = href ? `[${escaped}](${href})` : escaped;
  return `\n\n${quoted}\n>\n> — ${source} (${day})\n`;
}
