import Mention from '@tiptap/extension-mention';
import type { SuggestionOptions } from '@tiptap/suggestion';

export interface DomeMentionItem {
  id: string;
  label: string;
  type?: string;
}

export function buildDomeResourceMention(
  suggestionOverrides: Partial<SuggestionOptions<DomeMentionItem>> = {},
) {
  return Mention.extend({
    addAttributes() {
      const parentAttrs = this.parent?.() ?? {};
      return {
        ...parentAttrs,
        resourceType: {
          default: 'note',
          parseHTML: (element) => element.getAttribute('data-resource-type') ?? 'note',
          renderHTML: (attributes: { resourceType?: string }) => {
            if (!attributes.resourceType) return {};
            return { 'data-resource-type': attributes.resourceType };
          },
        },
      };
    },
  }).configure({
    HTMLAttributes: {
      class: 'dome-resource-mention',
    },
    deleteTriggerWithBackspace: true,
    suggestion: {
      char: '@',
      allowSpaces: true,
      items: async ({ query, editor }) => {
        const bridge = editor.storage.noteEditorBridge;
        const projectId = bridge?.projectId ?? '';
        const api = window.electron?.db?.resources;
        if (!api?.searchForMention) return [];
        const res = await api.searchForMention(query ?? '');
        if (!res?.success || !Array.isArray(res.data)) return [];
        const rows = res.data as Array<{
          id: string;
          title: string;
          type: string;
          project_id?: string;
        }>;
        return rows
          .filter((r) => !projectId || r.project_id === projectId)
          .map((r) => ({ id: r.id, label: r.title, type: r.type }));
      },
      command: ({ editor, range, props }) => {
        const item = props as DomeMentionItem;
        let to = range.to;
        const nodeAfter = editor.state.selection.$to.nodeAfter;
        if (nodeAfter?.text?.startsWith(' ')) to += 1;
        editor
          .chain()
          .focus()
          .insertContentAt(
            { from: range.from, to },
            [
              {
                type: 'mention',
                attrs: {
                  id: item.id,
                  label: item.label,
                  resourceType: item.type ?? 'note',
                  mentionSuggestionChar: '@',
                },
              },
              { type: 'text', text: ' ' },
            ],
          )
          .run();
      },
      ...suggestionOverrides,
    },
  });
}
