export type ComposerHighlightSpan = {
  start: number;
  end: number;
  kind: 'mention' | 'skill' | 'mcp' | 'file';
  tokenKey: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function overlaps(span: ComposerHighlightSpan, spans: ComposerHighlightSpan[]): boolean {
  return spans.some((s) => span.start < s.end && span.end > s.start);
}

function mergeSpans(spans: ComposerHighlightSpan[]): ComposerHighlightSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: ComposerHighlightSpan[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (!last || span.start >= last.end) {
      merged.push(span);
      continue;
    }
    if (span.end > last.end) {
      last.end = span.end;
      last.tokenKey = span.tokenKey;
      last.kind = span.kind;
    }
  }
  return merged;
}

export function buildComposerHighlightSpans(
  text: string,
  options: {
    mentionLabels?: string[];
    skillLabels?: string[];
    fileNames?: string[];
  },
): ComposerHighlightSpan[] {
  const spans: ComposerHighlightSpan[] = [];
  const labels = [...(options.mentionLabels ?? []), ...(options.fileNames ?? [])]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const label of labels) {
    const isFile = options.fileNames?.includes(label) ?? false;
    const pattern = new RegExp(`@${escapeRegExp(label)}(?=\\s|$|[.,!?;:])`, 'g');
    for (const match of text.matchAll(pattern)) {
      if (match.index == null) continue;
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        kind: isFile ? 'file' : 'mention',
        tokenKey: `${isFile ? 'file' : 'mention'}:${label}`,
      });
    }
  }

  for (const label of (options.skillLabels ?? []).filter(Boolean).sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`/${escapeRegExp(label)}(?=\\s|$|[.,!?;:])`, 'g');
    for (const match of text.matchAll(pattern)) {
      if (match.index == null) continue;
      const span: ComposerHighlightSpan = {
        start: match.index,
        end: match.index + match[0].length,
        kind: 'skill',
        tokenKey: `skill:${label}`,
      };
      if (!overlaps(span, spans)) spans.push(span);
    }
  }

  for (const match of text.matchAll(/\/([a-zA-Z0-9][a-zA-Z0-9_-]*)/g)) {
    if (match.index == null) continue;
    const span: ComposerHighlightSpan = {
      start: match.index,
      end: match.index + match[0].length,
      kind: 'skill',
      tokenKey: `skill:${match[1]}`,
    };
    if (!overlaps(span, spans)) spans.push(span);
  }

  for (const match of text.matchAll(/#([a-zA-Z0-9][a-zA-Z0-9_-]*)/g)) {
    if (match.index == null) continue;
    const span: ComposerHighlightSpan = {
      start: match.index,
      end: match.index + match[0].length,
      kind: 'mcp',
      tokenKey: `mcp:${match[1]}`,
    };
    if (!overlaps(span, spans)) spans.push(span);
  }

  return mergeSpans(spans);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/'/g, '&#39;');
}

export function buildComposerMirrorHtml(text: string, spans: ComposerHighlightSpan[]): string {
  if (!text) return '&nbsp;';
  if (spans.length === 0) return escapeHtml(text);

  let html = '';
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      html += escapeHtml(text.slice(cursor, span.start));
    }
    const chunk = text.slice(span.start, span.end);
    html += `<span class="composer-text-ref composer-text-ref--${span.kind}" data-token-key="${escapeAttr(span.tokenKey)}">${escapeHtml(chunk)}</span>`;
    cursor = span.end;
  }
  if (cursor < text.length) {
    html += escapeHtml(text.slice(cursor));
  }
  return html || '&nbsp;';
}

export type ComposerTokenTooltip = {
  title: string;
  description: string;
};
