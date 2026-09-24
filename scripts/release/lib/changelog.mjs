function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractSection(markdown, version) {
  const start = new RegExp(`^## \\[${escapeRegExp(version)}\\]`, 'm');
  const match = start.exec(markdown);
  if (!match) return null;
  const rest = markdown.slice(match.index + match[0].length);
  const next = /^## /m.exec(rest);
  const body = next ? rest.slice(0, next.index) : rest;
  const newline = body.indexOf('\n');
  const trimmed = (newline === -1 ? '' : body.slice(newline + 1)).trim();
  return trimmed.length > 0 ? trimmed : null;
}
