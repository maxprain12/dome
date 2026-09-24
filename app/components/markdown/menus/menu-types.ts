import type { Editor, Range } from '@tiptap/core';
import type { IconSvgElement } from '@hugeicons/react';
import type { NoteEditorProfile } from '../extensions/types';

export interface MenuEntry {
  id: string;
  label: string;
  keywords?: string;
  description?: string;
  group?: string;
  icon?: IconSvgElement;
  profiles?: NoteEditorProfile[];
  run?: (editor: Editor, range: Range) => void;
}
