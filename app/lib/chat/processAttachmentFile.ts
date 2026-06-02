import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import { INLINE_VIDEO_MAX_BYTES, newAttachmentId } from '@/lib/chat/attachmentTypes';

const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']);

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
  if (VIDEO_MIME.has(file.type) || /\.(mp4|mov|avi|mkv)$/i.test(file.name)) {
    if (file.size > INLINE_VIDEO_MAX_BYTES) {
      const getPath = window.electron?.getPathForFile;
      const p = typeof getPath === 'function' ? getPath(file) : null;
      if (p) {
        return {
          id,
          kind: 'video' as const,
          name: file.name,
          mime: file.type || 'video/mp4',
          sizeBytes: file.size,
          filePath: p,
          status: 'ready' as const,
        };
      }
      return null;
    }
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () =>
        resolve({
          id,
          kind: 'video' as const,
          name: file.name,
          dataUrl: r.result as string,
          mime: file.type || 'video/mp4',
          sizeBytes: file.size,
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

/**
 * Upload large video files to MiniMax Files API when needed.
 */
export async function prepareVideoAttachmentsForRun(
  items: ChatAttachment[],
): Promise<ChatAttachment[]> {
  const out: ChatAttachment[] = [];
  for (const item of items) {
    if (item.kind !== 'video' || item.fileId || item.dataUrl) {
      out.push(item);
      continue;
    }
    if (!item.filePath || !window.electron?.minimax?.uploadFile) {
      out.push(item);
      continue;
    }
    try {
      const res = await window.electron.minimax.uploadFile({
        filePath: item.filePath,
        purpose: 'video_understanding',
      });
      if (res.success && res.fileId) {
        out.push({ ...item, fileId: String(res.fileId), status: 'ready' });
      } else {
        out.push({ ...item, status: 'error' });
      }
    } catch {
      out.push({ ...item, status: 'error' });
    }
  }
  return out;
}
