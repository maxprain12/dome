/** Segment for rendering user chat content (attachments use markdown image syntax). */
export type UserMessageVisualSegment =
  | { type: 'text'; value: string }
  | { type: 'image'; src: string; alt?: string };

const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

/**
 * Split markdown-style ![alt](url) image references from plain text.
 * Used when the composer embeds attachments as markdown image lines.
 */
export function parseUserMessageVisualSegments(content: string): UserMessageVisualSegment[] {
  const segments: UserMessageVisualSegment[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  const trimmed = typeof content === 'string' ? content : '';
  while ((m = IMAGE_RE.exec(trimmed)) !== null) {
    const [full, alt, src] = m;
    const start = m.index;
    if (start > lastIndex) {
      segments.push({ type: 'text', value: trimmed.slice(lastIndex, start) });
    }
    segments.push({ type: 'image', src: String(src), alt: alt ? String(alt) : undefined });
    lastIndex = start + full.length;
  }
  if (lastIndex < trimmed.length) {
    segments.push({ type: 'text', value: trimmed.slice(lastIndex) });
  }
  return segments.length ? segments : [{ type: 'text', value: trimmed }];
}
