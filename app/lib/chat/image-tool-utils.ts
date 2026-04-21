/**
 * Parse tool results that include image content arrays (e.g. pdf_render_page with data_url).
 */

function toDataUrl(data: string, mimeType: string): string {
  return `data:${mimeType};base64,${data}`;
}

/** Parse result as image data URL from generic tool payloads */
export function parseImageResult(result: unknown): { dataUrl: string; alt?: string } | null {
  if (!result) return null;
  let parsed: unknown;
  if (typeof result === 'string') {
    try {
      parsed = JSON.parse(result);
    } catch {
      if (typeof result === 'string' && result.startsWith('data:image/')) return { dataUrl: result };
      return null;
    }
  } else if (result && typeof result === 'object') {
    parsed = result;
  } else {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.data_url === 'string' && obj.data_url.startsWith('data:image/')) {
    return { dataUrl: obj.data_url, alt: `p.${obj.page_number ?? ''}` };
  }
  const imageFields = ['croppedImage', 'thumbnail', 'screenshot', 'image', 'dataUrl', 'imageData'];
  for (const field of imageFields) {
    const value = obj[field];
    if (typeof value === 'string' && value.startsWith('data:image/')) {
      return { dataUrl: value, alt: String(obj.title || obj.alt || field) };
    }
  }
  const content = obj.content;
  if (Array.isArray(content)) {
    const imgBlock = content.find((c: unknown) => c && typeof c === 'object' && (c as { type?: string }).type === 'image');
    if (imgBlock && typeof imgBlock === 'object') {
      const block = imgBlock as { data?: string; mimeType?: string };
      if (typeof block.data === 'string' && block.data) {
        const mime = block.mimeType || 'image/png';
        const textBlock = content.find((c: unknown) => c && typeof c === 'object' && (c as { type?: string }).type === 'text');
        const alt = textBlock && typeof textBlock === 'object' ? String((textBlock as { text?: string }).text || '') : undefined;
        return { dataUrl: toDataUrl(block.data, mime), alt };
      }
    }
  }
  return null;
}

/** Parse result as multiple images from content[] */
export function parseContentImages(result: unknown): Array<{ dataUrl: string; label?: string }> | null {
  if (!result) return null;
  let parsed: unknown;
  if (typeof result === 'string') {
    try {
      parsed = JSON.parse(result);
    } catch {
      return null;
    }
  } else if (result && typeof result === 'object') {
    parsed = result;
  } else {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const content = obj.content;
  if (!Array.isArray(content) || content.length === 0) return null;
  const items: Array<{ dataUrl: string; label?: string }> = [];
  let lastLabel: string | undefined;
  for (const c of content) {
    if (!c || typeof c !== 'object') continue;
    const block = c as { type?: string; text?: string; data?: string; mimeType?: string };
    if (block.type === 'text' && typeof block.text === 'string') {
      lastLabel = block.text;
    } else if (block.type === 'image' && typeof block.data === 'string' && block.data) {
      const mime = block.mimeType || 'image/png';
      const label = lastLabel && (lastLabel.startsWith('Figure') || lastLabel.length < 80) ? lastLabel : undefined;
      items.push({ dataUrl: toDataUrl(block.data, mime), label });
      lastLabel = undefined;
    }
  }
  return items.length > 0 ? items : null;
}
