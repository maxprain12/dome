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

export type ChatAttachmentDocument = {
  id: string;
  kind: 'document';
  name: string;
  text: string | null;
  pageCount?: number | null;
  status?: 'loading' | 'ready' | 'error';
};

export type ChatAttachment = ChatAttachmentImage | ChatAttachmentDocument;

export function buildAttachmentPrefix(items: ChatAttachment[], emptyDocumentPlaceholder: string): string {
  if (items.length === 0) return '';
  const parts: string[] = [];
  for (const a of items) {
    if (a.kind === 'image') {
      parts.push(`\n![${a.name}](${a.dataUrl})\n`);
    } else {
      const body = a.text && a.text.trim() ? a.text : emptyDocumentPlaceholder;
      parts.push(`\n### ${a.name}\n\n${body}\n`);
    }
  }
  return parts.join('\n');
}
