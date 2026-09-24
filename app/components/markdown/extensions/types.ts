import type { Editor } from '@tiptap/core';

export type NoteEditorProfile = 'note' | 'cms' | 'embedded';

export interface NoteOutlineItem {
  id: string;
  level: number;
  text: string;
  pos: number;
}

export interface EditorRange {
  from: number;
  to: number;
}

export interface MathEditRequest {
  latex: string;
  pos: number;
  kind: 'inline' | 'block';
  /** Insert a new block instead of editing the node at `pos`. */
  create?: boolean;
  /** Slash-menu range to remove once the equation is confirmed. */
  range?: EditorRange;
}

export interface NoteExtensionContext {
  profile: NoteEditorProfile;
  placeholder: () => string;
  siteImages: () => Map<string, string> | undefined;
  siteUrl: () => string | undefined;
  refreshers?: Set<() => void>;
  uploadImages: (files: File[], pos?: number) => void;
  openMath: (request: MathEditRequest) => void;
  onOutline: (items: NoteOutlineItem[]) => void;
  pickImage: () => void;
  insertYoutube: (range: EditorRange) => void;
  askAi: (editor: Editor, range: EditorRange) => void;
}

export function extensionContext(
  profile: NoteEditorProfile,
  overrides?: Partial<NoteExtensionContext>,
): NoteExtensionContext {
  return {
    placeholder: () => '',
    siteImages: () => undefined,
    siteUrl: () => undefined,
    uploadImages: () => {},
    openMath: () => {},
    onOutline: () => {},
    pickImage: () => {},
    insertYoutube: () => {},
    askAi: () => {},
    ...overrides,
    profile,
  };
}
