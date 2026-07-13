import type { IconSvgElement } from '@hugeicons/react';
import {
  BookOpen01Icon,
  Comment01Icon,
  File01Icon,
  File02Icon,
  FileSpreadsheetIcon,
  FileTypeIcon,
  Folder01Icon,
  GitBranchIcon,
  GlobeIcon,
  Image01Icon,
  Layers01Icon,
  MusicNote01Icon,
  Presentation01Icon,
  SparklesIcon,
  StickyNote02Icon,
  Video01Icon,
  YoutubeIcon,
} from '@hugeicons/core-free-icons';

/** Canonical visual kinds for resources, attachments, and citations. */
export type ResourceVisualKind =
  | 'pdf'
  | 'note'
  | 'notebook'
  | 'docx'
  | 'excel'
  | 'ppt'
  | 'image'
  | 'audio'
  | 'video'
  | 'url'
  | 'youtube'
  | 'folder'
  | 'artifact'
  | 'chat'
  | 'graph'
  | 'studio'
  | 'annotation'
  | 'file';

export type ResourceVisualTone =
  | 'pdf'
  | 'note'
  | 'notebook'
  | 'sheet'
  | 'deck'
  | 'image'
  | 'audio'
  | 'video'
  | 'web'
  | 'folder'
  | 'artifact'
  | 'neutral';

const TYPE_TO_KIND: Record<string, ResourceVisualKind> = {
  pdf: 'pdf',
  note: 'note',
  notebook: 'notebook',
  docx: 'docx',
  document: 'docx',
  excel: 'excel',
  ppt: 'ppt',
  image: 'image',
  audio: 'audio',
  video: 'video',
  url: 'url',
  youtube: 'youtube',
  folder: 'folder',
  artifact: 'artifact',
  chat: 'chat',
  graph: 'graph',
  studio: 'studio',
  annotation: 'annotation',
  file: 'file',
};

const EXT_TO_KIND: Record<string, ResourceVisualKind> = {
  pdf: 'pdf',
  txt: 'note',
  md: 'note',
  rtf: 'note',
  odt: 'note',
  doc: 'docx',
  docx: 'docx',
  xls: 'excel',
  xlsx: 'excel',
  csv: 'excel',
  ppt: 'ppt',
  pptx: 'ppt',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
};

export const RESOURCE_ICON_MAP: Record<ResourceVisualKind, IconSvgElement> = {
  pdf: File01Icon,
  note: File02Icon,
  notebook: BookOpen01Icon,
  docx: FileTypeIcon,
  excel: FileSpreadsheetIcon,
  ppt: Presentation01Icon,
  image: Image01Icon,
  audio: MusicNote01Icon,
  video: Video01Icon,
  url: GlobeIcon,
  youtube: YoutubeIcon,
  folder: Folder01Icon,
  artifact: Layers01Icon,
  chat: Comment01Icon,
  graph: GitBranchIcon,
  studio: SparklesIcon,
  annotation: StickyNote02Icon,
  file: File01Icon,
};

export function normalizeResourceType(type?: string | null): string {
  return (type ?? '').trim().toLowerCase();
}

export function inferResourceVisualKind(
  type?: string | null,
  name?: string | null,
): ResourceVisualKind {
  const normalized = normalizeResourceType(type);
  if (normalized && TYPE_TO_KIND[normalized]) {
    return TYPE_TO_KIND[normalized];
  }
  const lower = (name ?? '').trim().toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop() : '';
  if (ext && EXT_TO_KIND[ext]) {
    return EXT_TO_KIND[ext];
  }
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    return 'youtube';
  }
  return 'file';
}

export function resourceVisualTone(kind: ResourceVisualKind): ResourceVisualTone {
  switch (kind) {
    case 'pdf':
      return 'pdf';
    case 'note':
    case 'annotation':
      return 'note';
    case 'notebook':
      return 'notebook';
    case 'docx':
      return 'note';
    case 'excel':
      return 'sheet';
    case 'ppt':
      return 'deck';
    case 'image':
      return 'image';
    case 'audio':
      return 'audio';
    case 'video':
    case 'youtube':
      return 'video';
    case 'url':
      return 'web';
    case 'folder':
      return 'folder';
    case 'artifact':
      return 'artifact';
    default:
      return 'neutral';
  }
}

export function resourceVisualCssSuffix(kind: ResourceVisualKind): string {
  return resourceVisualTone(kind);
}
