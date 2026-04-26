import type { Editor, JSONContent } from '@tiptap/core';
import { stringToEditorHtml } from '@/lib/utils/markdown';

export type TipTapAIInsertMode = 'insert' | 'replace_selection' | 'append';

export interface TipTapAIActions {
  insertMarkdown: (markdown: string, mode?: TipTapAIInsertMode) => boolean;
  insertResourceMention: (resource: { id: string; title: string; type?: string }) => boolean;
  getSelectedMarkdownContext: () => string;
}

function getSelectedText(editor: Editor): string {
  const { from, to } = editor.state.selection;
  if (from === to) return '';
  return editor.state.doc.textBetween(from, to, '\n\n');
}

export function createTipTapAIActions(editor: Editor): TipTapAIActions {
  return {
    insertMarkdown(markdown, mode = 'insert') {
      const html = stringToEditorHtml(markdown);
      if (!html) return false;

      if (mode === 'append') {
        const end = editor.state.doc.content.size;
        return editor.chain().focus().insertContentAt(end, html).run();
      }

      if (mode === 'replace_selection') {
        const { from, to } = editor.state.selection;
        return editor.chain().focus().insertContentAt({ from, to }, html).run();
      }

      return editor.chain().focus().insertContent(html).run();
    },

    insertResourceMention(resource) {
      const mention: JSONContent = {
        type: 'mention',
        attrs: {
          id: resource.id,
          label: resource.title,
          resourceType: resource.type ?? 'note',
          mentionSuggestionChar: '@',
        },
      };
      return editor.chain().focus().insertContent([mention, { type: 'text', text: ' ' }]).run();
    },

    getSelectedMarkdownContext() {
      return getSelectedText(editor);
    },
  };
}
