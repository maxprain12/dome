/**
 * Parse tool results that include image content arrays (e.g. pdf_render_page with data_url).
 */

function toDataUrl(data: string, mimeType: string): string {
  return `data:${mimeType};base64,${data}`;
}

/** Parse result as image data URL from generic tool payloads */
export function parseImageResult(result: unknown): { dataUrl: string; alt?: string } | null {
  const obj = coerceImageResult(result);
  if (!obj) return null;
  return (
    pickFromDataUrlField(obj) ??
    pickFirstImageField(obj) ??
    pickFromContentArray(obj)
  );
}

interface ImageContentBlock {
  type?: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

function coerceImageResult(result: unknown): Record<string, unknown> | null {
  if (!result) return null;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      if (result.startsWith('data:image/')) return { dataUrl: result };
    }
    return null;
  }
  if (typeof result === 'object') return result as Record<string, unknown>;
  return null;
}

function pickFromDataUrlField(obj: Record<string, unknown>): { dataUrl: string; alt?: string } | null {
  const { data_url } = obj;
  if (typeof data_url === 'string' && data_url.startsWith('data:image/')) {
    return { dataUrl: data_url, alt: `p.${obj.page_number ?? ''}` };
  }
  return null;
}

const IMAGE_PAYLOAD_FIELDS = ['croppedImage', 'thumbnail', 'screenshot', 'image', 'dataUrl', 'imageData'];

function pickFirstImageField(obj: Record<string, unknown>): { dataUrl: string; alt?: string } | null {
  for (const field of IMAGE_PAYLOAD_FIELDS) {
    const value = obj[field];
    if (typeof value === 'string' && value.startsWith('data:image/')) {
      return { dataUrl: value, alt: String(obj.title || obj.alt || field) };
    }
  }
  return null;
}

function isImageContentBlock(block: unknown): block is ImageContentBlock {
  return !!block && typeof block === 'object' && (block as ImageContentBlock).type === 'image';
}

function isTextContentBlock(block: unknown): block is ImageContentBlock {
  return !!block && typeof block === 'object' && (block as ImageContentBlock).type === 'text';
}

function pickFromContentArray(obj: Record<string, unknown>): { dataUrl: string; alt?: string } | null {
  const content = obj.content;
  if (!Array.isArray(content)) return null;
  const imgBlock = content.find(isImageContentBlock);
  if (!imgBlock) return null;
  if (typeof imgBlock.data !== 'string' || !imgBlock.data) return null;
  const mime = imgBlock.mimeType || 'image/png';
  const textBlock = content.find(isTextContentBlock);
  const alt = textBlock ? String(textBlock.text || '') : undefined;
  return { dataUrl: toDataUrl(imgBlock.data, mime), alt };
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
