'use strict';

/** Markdown image syntax used by chat composers: ![alt](url) */
const IMAGE_MARKDOWN_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

/**
 * @typedef {{ type: 'text', value: string } | { type: 'image', src: string, alt?: string }} VisualSegment
 */

/**
 * Split markdown-style ![alt](url) image references from plain text.
 * @param {string} content
 * @returns {VisualSegment[]}
 */
function parseMarkdownImages(content) {
  const segments = [];
  let lastIndex = 0;
  let m;
  const trimmed = typeof content === 'string' ? content : '';
  const re = new RegExp(IMAGE_MARKDOWN_RE.source, IMAGE_MARKDOWN_RE.flags);
  while ((m = re.exec(trimmed)) !== null) {
    const full = m[0];
    const alt = m[1];
    const src = m[2];
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

/**
 * Extract image data URLs and remaining text from message content.
 * @param {string} content
 * @returns {{ text: string, images: Array<{ dataUrl: string, alt?: string }> }}
 */
function extractMarkdownImages(content) {
  const segments = parseMarkdownImages(content);
  const images = [];
  const textParts = [];
  for (const seg of segments) {
    if (seg.type === 'image' && seg.src) {
      images.push({ dataUrl: seg.src, alt: seg.alt });
    } else if (seg.type === 'text' && seg.value.trim()) {
      textParts.push(seg.value.trim());
    }
  }
  return { text: textParts.join('\n\n'), images };
}

module.exports = {
  IMAGE_MARKDOWN_RE,
  parseMarkdownImages,
  extractMarkdownImages,
};
