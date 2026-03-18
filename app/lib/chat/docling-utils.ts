/**
 * Shared utilities for parsing Docling tool results (docling_show_page_images, docling_show_image).
 * Used by ChatToolCard and ChatMessage to extract and display document figures.
 */

function toDataUrl(data: string, mimeType: string): string {
  return `data:${mimeType};base64,${data}`;
}

/** Parse result as image data URL (single image, docling_show_image) */
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

/** Parse result as multiple images from content[] (docling_show_page_images) */
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

/** Extract all docling images from tool calls for display in message content */
export function extractDoclingImagesFromToolCalls(
  toolCalls?: Array<{ name: string; result?: unknown }>
): Array<{ dataUrl: string; label?: string }> {
  if (!toolCalls?.length) return [];
  const items: Array<{ dataUrl: string; label?: string }> = [];
  for (const tc of toolCalls) {
    if (tc.name === 'docling_show_page_images') {
      const contentImages = parseContentImages(tc.result);
      if (contentImages?.length) items.push(...contentImages);
    } else if (tc.name === 'docling_show_image') {
      const imageItem = parseImageResult(tc.result);
      if (imageItem) items.push({ dataUrl: imageItem.dataUrl, label: imageItem.alt });
    }
  }
  return items;
}

/** Build docling_images artifact from docling_list_images result (fallback when AI fails to output artifact) */
export function buildDoclingArtifactFromListImages(
  toolCalls?: Array<{ name: string; arguments?: Record<string, unknown>; result?: unknown }>
): { type: 'docling_images'; resource_id: string; resource_title?: string; images: Array<{ image_id: string; caption?: string; page_no?: number }> } | null {
  if (!toolCalls?.length) return null;
  for (const tc of toolCalls) {
    if (tc.name !== 'docling_list_images') continue;
    let parsed: unknown;
    if (typeof tc.result === 'string') {
      try {
        parsed = JSON.parse(tc.result);
      } catch {
        continue;
      }
    } else if (tc.result && typeof tc.result === 'object') {
      parsed = tc.result;
    } else {
      continue;
    }
    const obj = parsed as Record<string, unknown>;
    if (!obj.success || !Array.isArray(obj.images) || obj.images.length === 0) continue;
    const resourceId = String((tc.arguments?.resource_id ?? tc.arguments?.resourceId ?? '') || '');
    if (!resourceId) continue;
    const images = obj.images
      .slice(0, 8)
      .map((img: Record<string, unknown>) => ({
        image_id: String(img.image_id ?? img.id ?? ''),
        caption: typeof img.caption === 'string' ? img.caption : `Figure ${(img.image_index as number ?? 0) + 1}`,
        page_no: typeof img.page_no === 'number' ? img.page_no : undefined,
      }))
      .filter((img) => img.image_id);
    if (images.length === 0) continue;
    return {
      type: 'docling_images',
      resource_id: resourceId,
      resource_title: 'Documento',
      images,
    };
  }
  return null;
}
