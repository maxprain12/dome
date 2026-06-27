/** Segment for rendering user chat content (attachments use markdown image syntax). */
export type UserMessageVisualSegment =
  | { type: 'text'; value: string }
  | { type: 'image'; src: string; alt?: string };

export type UserMessageImageRef = { id?: string; dataUrl: string; name: string };

const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
const DOME_ATT_RE = /^dome-att:\/\/([^)\s]+)$/i;
const DATA_IMAGE_RE = /^data:image\//i;

const BASE64_BLOB_RE = /data:image\/[^;\s]+;base64,[A-Za-z0-9+/=\s]{200,}/g;
const LONG_B64_RE = /[A-Za-z0-9+/=]{500,}/g;

/** Redact huge base64 / data-URL blobs from visible text. */
export function redactBase64FromText(text: string): string {
  let out = text.replace(BASE64_BLOB_RE, '[image]');
  if (out.length > 400 && LONG_B64_RE.test(out)) {
    out = out.replace(LONG_B64_RE, '[…]');
  }
  return out.trim();
}

function resolveImageSrc(
  raw: string,
  images?: UserMessageImageRef[],
): { src: string; alt?: string } | null {
  const src = String(raw).trim();
  if (DATA_IMAGE_RE.test(src)) {
    return { src };
  }
  const attMatch = DOME_ATT_RE.exec(src);
  if (attMatch && images?.length) {
    const id = attMatch[1];
    const byId = images.find((img) => img.id === id);
    if (byId) return { src: byId.dataUrl, alt: byId.name };
    const byName = images.find((img) => img.name === id);
    if (byName) return { src: byName.dataUrl, alt: byName.name };
  }
  return null;
}

/**
 * Split markdown-style ![alt](url) image references from plain text.
 * Resolves dome-att:// ids via optional structured image attachments.
 */
export function parseUserMessageVisualSegments(
  content: string,
  images?: UserMessageImageRef[],
): UserMessageVisualSegment[] {
  const segments: UserMessageVisualSegment[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  const trimmed = typeof content === 'string' ? content : '';
  const re = new RegExp(IMAGE_RE.source, IMAGE_RE.flags);
  while ((m = re.exec(trimmed)) !== null) {
    const [full, alt, rawSrc] = m;
    const start = m.index;
    if (start > lastIndex) {
      const text = redactBase64FromText(trimmed.slice(lastIndex, start));
      if (text) segments.push({ type: 'text', value: text });
    }
    const resolved = resolveImageSrc(String(rawSrc), images);
    if (resolved) {
      segments.push({
        type: 'image',
        src: resolved.src,
        alt: alt ? String(alt) : resolved.alt,
      });
    } else if (!DOME_ATT_RE.test(String(rawSrc))) {
      segments.push({ type: 'text', value: redactBase64FromText(full) });
    }
    lastIndex = start + full.length;
  }
  if (lastIndex < trimmed.length) {
    const text = redactBase64FromText(trimmed.slice(lastIndex));
    if (text) segments.push({ type: 'text', value: text });
  }
  if (!segments.length) {
    const text = redactBase64FromText(trimmed);
    return text ? [{ type: 'text', value: text }] : [];
  }
  return segments;
}
