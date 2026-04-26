import { Extension } from '@tiptap/core';
import type { TipTapAIActions } from '@/lib/tiptap/ai-actions';

export type NoteEmbedKind = 'youtube' | 'iframe';

export interface NoteEditorBridgeStorage {
  projectId: string;
  openResourcePicker: (mode?: 'link' | 'split' | 'mention') => void;
  openImagePicker: () => void;
  openEmbedModal: (kind: NoteEmbedKind) => void;
  aiActions: TipTapAIActions | null;
}

declare module '@tiptap/core' {
  interface Storage {
    noteEditorBridge: NoteEditorBridgeStorage;
  }
}

export const NoteEditorBridge = Extension.create({
  name: 'noteEditorBridge',

  addStorage() {
    return {
      projectId: '',
      openResourcePicker: () => {},
      openImagePicker: () => {},
      openEmbedModal: () => {},
      aiActions: null,
    } satisfies NoteEditorBridgeStorage;
  },
});
