import type { ClipboardEvent } from 'react';

export type ComposerImagePasteOptions = {
  supportsImage: boolean;
  onUnsupported?: () => void;
  onFiles: (files: FileList) => void;
};

/**
 * Intercept clipboard image paste (file item or data:image/ text) so base64 never
 * lands in the textarea. Returns true when the event was handled.
 */
export async function handleComposerImagePaste(
  e: ClipboardEvent,
  options: ComposerImagePasteOptions,
): Promise<boolean> {
  const { supportsImage, onUnsupported, onFiles } = options;
  const items = e.clipboardData?.items;
  if (!items?.length) return false;

  for (const it of items) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      e.preventDefault();
      if (!supportsImage) {
        onUnsupported?.();
        return true;
      }
      const f = it.getAsFile();
      if (f) {
        const d = new DataTransfer();
        d.items.add(f);
        onFiles(d.files);
      }
      return true;
    }
  }

  const text = e.clipboardData.getData('text/plain')?.trim();
  if (text && /^data:image\//i.test(text)) {
    e.preventDefault();
    if (!supportsImage) {
      onUnsupported?.();
      return true;
    }
    try {
      const res = await fetch(text);
      const blob = await res.blob();
      const sub = blob.type.split('/')[1]?.split('+')[0] || 'png';
      const file = new File([blob], `pasted-image.${sub}`, { type: blob.type || 'image/png' });
      const d = new DataTransfer();
      d.items.add(file);
      onFiles(d.files);
    } catch {
      onUnsupported?.();
    }
    return true;
  }

  return false;
}
