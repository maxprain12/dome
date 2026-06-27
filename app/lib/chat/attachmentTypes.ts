export function newAttachmentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

import {
  inferResourceVisualKind,
  type ResourceVisualKind,
} from '@/lib/resources/resourceVisual';

/** @deprecated Prefer ResourceVisualKind — kept for chat composer call sites. */
export type AttachmentVisualKind = ResourceVisualKind;

export function attachmentVisualKind(name: string, mime?: string): ResourceVisualKind {
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('video/')) return 'video';
  return inferResourceVisualKind(undefined, name);
}

export type ChatAttachmentImage = {
  id: string;
  kind: 'image';
  name: string;
  dataUrl: string;
  mime: string;
  status?: 'ready';
};

export type ChatAttachmentVideo = {
  id: string;
  kind: 'video';
  name: string;
  mime: string;
  sizeBytes: number;
  dataUrl?: string;
  fileId?: string;
  filePath?: string;
  status?: 'ready' | 'uploading' | 'error';
};

export type ChatAttachmentDocument = {
  id: string;
  kind: 'document';
  name: string;
  text: string | null;
  pageCount?: number | null;
  status?: 'loading' | 'ready' | 'error';
};

export type ChatAttachment = ChatAttachmentImage | ChatAttachmentVideo | ChatAttachmentDocument;

/** Inline video limit for base64 upload (MiniMax M3). Larger files use Files API. */
export const INLINE_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export type StructuredMessageAttachments = {
  images: Array<{ id?: string; dataUrl: string; mime: string; name: string }>;
  videos: Array<{
    dataUrl?: string;
    fileId?: string;
    mime: string;
    name: string;
    sizeBytes?: number;
  }>;
};

export function buildAttachmentPrefix(items: ChatAttachment[], emptyDocumentPlaceholder: string): string {
  if (items.length === 0) return '';
  const parts: string[] = [];
  for (const a of items) {
    if (a.kind === 'image') {
      parts.push(`\n![${a.name}](dome-att://${a.id})\n`);
    } else if (a.kind === 'video') {
      parts.push(`\n[Video: ${a.name}]\n`);
    } else {
      const body = a.text && a.text.trim() ? a.text : emptyDocumentPlaceholder;
      parts.push(`\n### ${a.name}\n\n${body}\n`);
    }
  }
  return parts.join('\n');
}

export function buildStructuredAttachments(items: ChatAttachment[]): StructuredMessageAttachments {
  const images: StructuredMessageAttachments['images'] = [];
  const videos: StructuredMessageAttachments['videos'] = [];
  for (const a of items) {
    if (a.kind === 'image') {
      images.push({ id: a.id, dataUrl: a.dataUrl, mime: a.mime, name: a.name });
    } else if (a.kind === 'video') {
      videos.push({
        dataUrl: a.dataUrl,
        fileId: a.fileId,
        mime: a.mime,
        name: a.name,
        sizeBytes: a.sizeBytes,
      });
    }
  }
  return { images, videos };
}

export type ChatRunMessage = {
  role: string;
  content: string;
  attachments?: StructuredMessageAttachments;
};

export function buildUserRunMessage(
  textPart: string,
  items: ChatAttachment[],
  emptyDocumentPlaceholder: string,
): ChatRunMessage {
  const attPrefix = buildAttachmentPrefix(items, emptyDocumentPlaceholder);
  const content = [attPrefix, textPart].filter((s) => s.length > 0).join('\n\n').trim();
  const attachments = buildStructuredAttachments(items);
  const hasAttachments = attachments.images.length > 0 || attachments.videos.length > 0;
  return {
    role: 'user',
    content,
    ...(hasAttachments ? { attachments } : {}),
  };
}
