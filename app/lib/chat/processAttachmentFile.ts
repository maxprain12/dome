import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import { newAttachmentId } from '@/lib/chat/attachmentTypes';

export async function processAttachmentFile(file: File): Promise<ChatAttachment | null> {
  const id = newAttachmentId();
  if (file.type.startsWith('image/')) {
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () =>
        resolve({
          id,
          kind: 'image' as const,
          name: file.name,
          dataUrl: r.result as string,
          mime: file.type,
          status: 'ready' as const,
        });
      r.onerror = () => resolve(null);
      r.readAsDataURL(file);
    });
  }
  const getPath = window.electron?.getPathForFile;
  const p = typeof getPath === 'function' ? getPath(file) : null;
  if (p && window.electron?.file?.readAttachment) {
    const res = await window.electron.file.readAttachment(p);
    if (res.success && res.data) {
      return {
        id,
        kind: 'document' as const,
        name: res.data.name,
        text: res.data.text,
        pageCount: res.data.pageCount ?? null,
        status: 'ready' as const,
      };
    }
  }
  if (file.type === 'text/plain' || /\.(txt|md|csv|json)$/i.test(file.name)) {
    const text = await file.text();
    return {
      id,
      kind: 'document' as const,
      name: file.name,
      text: text.slice(0, 80_000),
      status: 'ready' as const,
    };
  }
  return null;
}
