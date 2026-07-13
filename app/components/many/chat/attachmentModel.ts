import type { ReactNode } from 'react';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import {
  inferResourceVisualKind,
  type ResourceVisualKind,
} from '@/lib/resources/resourceVisual';

export type AttachmentUiState = 'idle' | 'uploading' | 'processing' | 'error' | 'done';

export function composerAttachmentState(attachment: ChatAttachment): AttachmentUiState {
  if (attachment.kind === 'document') {
    if (attachment.status === 'loading') return 'processing';
    if (attachment.status === 'error') return 'error';
    return 'done';
  }
  if (attachment.kind === 'video' && attachment.status === 'uploading') return 'uploading';
  if (attachment.kind === 'video' && attachment.status === 'error') return 'error';
  return 'done';
}

export function composerAttachmentKind(attachment: ChatAttachment): ResourceVisualKind {
  if (attachment.kind === 'image') return 'image';
  if (attachment.kind === 'video') return 'video';
  return inferResourceVisualKind(undefined, attachment.name);
}

export function pinnedResourceKind(type: string | undefined, title: string): ResourceVisualKind {
  return inferResourceVisualKind(type, title);
}

export function formatAttachmentDescription(
  attachment: ChatAttachment,
  pagesLabel?: string,
): string | undefined {
  if (attachment.kind === 'document' && attachment.pageCount) {
    return pagesLabel;
  }
  if (attachment.kind === 'video' && attachment.sizeBytes) {
    const mb = attachment.sizeBytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(attachment.sizeBytes / 1024)} KB`;
  }
  return undefined;
}

export interface SentImageAttachment {
  id?: string;
  dataUrl: string;
  name: string;
}

export function sentImageAttachmentKey(image: SentImageAttachment, index: number): string {
  return image.id ?? `img-${index}-${image.name}`;
}

export type ComposerAttachmentMedia =
  | { variant: 'image'; src: string; alt: string }
  | { variant: 'icon'; icon: ReactNode };
