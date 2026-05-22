import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NoteDocWidthPreset = 'narrow' | 'regular' | 'wide';
export type NoteDocTypographyPreset = 'small' | 'regular' | 'large';
/** Inline: título grande bajo la barra (Notion-like). Compact: título destacado dentro de la barra superior. */
export type NoteHeaderLayout = 'inline' | 'compact_bar';
/** Stub para futuros modos (“solo bubble” vs bubble+insert flotante). */
export type NoteToolbarPresentation = 'bubble_and_floating';

export interface NoteUiTweaksState {
  sceneLabel: string;
  headerLayout: NoteHeaderLayout;
  toolbarPresentation: NoteToolbarPresentation;
  showFloatingInsertBar: boolean;
  docWidth: NoteDocWidthPreset;
  docTypography: NoteDocTypographyPreset;
  showNoteCover: boolean;
  showMetadataBar: boolean;
  setSceneLabel: (v: string) => void;
  setHeaderLayout: (v: NoteHeaderLayout) => void;
  setToolbarPresentation: (v: NoteToolbarPresentation) => void;
  setShowFloatingInsertBar: (v: boolean) => void;
  setDocWidth: (v: NoteDocWidthPreset) => void;
  setDocTypography: (v: NoteDocTypographyPreset) => void;
  setShowNoteCover: (v: boolean) => void;
  setShowMetadataBar: (v: boolean) => void;
}

export const useNoteUiTweaksStore = create<NoteUiTweaksState>()(
  persist(
    (set) => ({
      sceneLabel: '',
      headerLayout: 'inline',
      toolbarPresentation: 'bubble_and_floating',
      showFloatingInsertBar: true,
      docWidth: 'regular',
      docTypography: 'regular',
      showNoteCover: true,
      showMetadataBar: true,

      setSceneLabel: (sceneLabel) => set({ sceneLabel }),
      setHeaderLayout: (headerLayout) => set({ headerLayout }),
      setToolbarPresentation: (toolbarPresentation) => set({ toolbarPresentation }),
      setShowFloatingInsertBar: (showFloatingInsertBar) => set({ showFloatingInsertBar }),
      setDocWidth: (docWidth) => set({ docWidth }),
      setDocTypography: (docTypography) => set({ docTypography }),
      setShowNoteCover: (showNoteCover) => set({ showNoteCover }),
      setShowMetadataBar: (showMetadataBar) => set({ showMetadataBar }),
    }),
    {
      name: 'dome-note-ui-tweaks-v1',
      partialize: (s) => ({
        sceneLabel: s.sceneLabel,
        headerLayout: s.headerLayout,
        toolbarPresentation: s.toolbarPresentation,
        showFloatingInsertBar: s.showFloatingInsertBar,
        docWidth: s.docWidth,
        docTypography: s.docTypography,
        showNoteCover: s.showNoteCover,
        showMetadataBar: s.showMetadataBar,
      }),
    },
  ),
);
