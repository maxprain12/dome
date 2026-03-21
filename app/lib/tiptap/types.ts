import type { JSONContent } from '@tiptap/core';

export interface NoteEditorProps {
  content?: JSONContent;
  editable?: boolean;
  placeholder?: string;
  onUpdate?: (json: JSONContent) => void;
}

export interface NoteContent {
  json: JSONContent;
  serialized: string;
}
