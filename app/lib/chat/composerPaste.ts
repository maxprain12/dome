import type { ClipboardEvent } from 'react';

export type ComposerImagePasteOptions = {
  supportsImage: boolean;
  onUnsupported?: () => void;
  onFiles: (files: FileList) => void;
};

async function handlePastedDataUrlImage(
  text: string,
  options: ComposerImagePasteOptions,
): Promise<boolean> {
  if (!options.supportsImage) {
    options.onUnsupported?.();
    return true;
  }
  try {
    const res = await fetch(text);
    const blob = await res.blob();
    const sub = blob.type.split('/')[1]?.split('+')[0] || 'png';
    const file = new File([blob], `pasted-image.${sub}`, { type: blob.type || 'image/png' });
    const d = new DataTransfer();
    d.items.add(file);
    options.onFiles(d.files);
  } catch {
    options.onUnsupported?.();
  }
  return true;
}

function handlePastedClipboardFileItem(
  item: DataTransferItem,
  options: ComposerImagePasteOptions,
): boolean {
  if (!options.supportsImage) {
    options.onUnsupported?.();
    return true;
  }
  const f = item.getAsFile();
  if (f) {
    const d = new DataTransfer();
    d.items.add(f);
    options.onFiles(d.files);
  }
  return true;
}

/**
 * Intercept clipboard image paste (file item or data:image/ text) so base64 never
 * lands in the textarea. Returns true when the event was handled.
 */
export async function handleComposerImagePaste(
  e: ClipboardEvent,
  options: ComposerImagePasteOptions,
): Promise<boolean> {
  const items = e.clipboardData?.items;
  if (!items?.length) return false;

  for (const it of items) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      e.preventDefault();
      return handlePastedClipboardFileItem(it, options);
    }
  }

  const text = e.clipboardData.getData('text/plain')?.trim();
  if (text && /^data:image\//i.test(text)) {
    e.preventDefault();
    return handlePastedDataUrlImage(text, options);
  }

  return false;
}
