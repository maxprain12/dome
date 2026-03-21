import type { Editor, JSONContent } from '@tiptap/core';

export function serializeNoteContent(editor: Editor): string {
  return JSON.stringify(editor.getJSON());
}

export function deserializeNoteContent(content: string | undefined | null): JSONContent | undefined {
  if (!content || !content.trim()) return undefined;
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && parsed.type === 'doc') return parsed as JSONContent;
    return undefined;
  } catch {
    return undefined;
  }
}

export function getDefaultNoteContent(): JSONContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  };
}
