import { Extension } from '@tiptap/core';

export type NoteEmbedKind = 'youtube' | 'iframe';

export interface NoteEditorBridgeStorage {
  projectId: string;
  openResourcePicker: (mode: 'link') => void;
  openImagePicker: () => void;
  openEmbedModal: (kind: NoteEmbedKind) => void;
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
    } satisfies NoteEditorBridgeStorage;
  },
});
