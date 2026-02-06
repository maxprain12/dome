import { Plugin, PluginKey } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';
import type { SlashCommandItem } from './SlashCommand';

export interface SlashCommandState {
  show: boolean;
  items: SlashCommandItem[];
  selectedIndex: number;
  query: string;
  range: { from: number; to: number } | null;
}

export const SlashCommandPluginKey = new PluginKey<SlashCommandState>('slashCommand');

export function createSlashCommandPlugin(items: SlashCommandItem[]) {
  return new Plugin<SlashCommandState>({
    key: SlashCommandPluginKey,

    state: {
      init(): SlashCommandState {
        return {
          show: false,
          items: [],
          selectedIndex: 0,
          query: '',
          range: null,
        };
      },

      apply(tr, value, oldState, newState): SlashCommandState {
        const { selection } = newState;
        const { $anchor } = selection;
        const textAfter = $anchor.parent.textContent.slice(0, $anchor.parentOffset);

        // Check if we're at the start of a line or after a space
        const isStartOfLine = $anchor.parentOffset === 0;
        const lastChar = textAfter.slice(-1);

        if (lastChar === '/' && (isStartOfLine || textAfter.slice(-2, -1) === ' ')) {
          const query = '';
          const filteredItems = items.filter((item) => {
            const titleMatch = item.title.toLowerCase().includes(query.toLowerCase());
            const keywordMatch = item.keywords?.some((kw) => kw.toLowerCase().includes(query.toLowerCase()));
            return titleMatch || keywordMatch;
          });

          return {
            show: true,
            items: filteredItems,
            selectedIndex: 0,
            query,
            range: {
              from: $anchor.pos - 1,
              to: $anchor.pos,
            },
          };
        }

        // If we're typing after a slash command
        if (value.show && lastChar !== '/') {
          const match = textAfter.match(/\/([^\s]*)$/);
          if (match && match[1] !== undefined) {
            const query = match[1];
            const filteredItems = items.filter((item) => {
              const q = query.toLowerCase();
              const titleMatch = item.title.toLowerCase().includes(q);
              const keywordMatch = item.keywords?.some((kw) => kw.toLowerCase().includes(q));
              const categoryMatch = item.category?.toLowerCase().includes(q);
              return titleMatch || keywordMatch || categoryMatch;
            });

            return {
              show: true,
              items: filteredItems,
              selectedIndex: 0,
              query,
              range: {
                from: $anchor.pos - query.length - 1,
                to: $anchor.pos,
              },
            };
          }
        }

        // Hide if we've moved away or deleted the slash
        if (value.show && (lastChar !== '/' && !textAfter.match(/\/([^\s]*)$/))) {
          return {
            show: false,
            items: [],
            selectedIndex: 0,
            query: '',
            range: null,
          };
        }

        return value;
      },
    },

    props: {
      handleKeyDown(view: EditorView, event: KeyboardEvent) {
        const state = SlashCommandPluginKey.getState(view.state) as SlashCommandState;
        if (!state || !state.show) return false;

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          const tr = view.state.tr;
          tr.setMeta('slashCommand', {
            type: 'updateSelectedIndex',
            index: (state.selectedIndex + 1) % state.items.length,
          });
          view.dispatch(tr);
          return true;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          const tr = view.state.tr;
          tr.setMeta('slashCommand', {
            type: 'updateSelectedIndex',
            index: (state.selectedIndex - 1 + state.items.length) % state.items.length,
          });
          view.dispatch(tr);
          return true;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          const item = state.items[state.selectedIndex];
          if (item && state.range) {
            // Get editor instance from view
            const editor = (view as any).editor;
            if (editor) {
              item.command({
                editor,
                range: state.range,
              });
            }
          }
          return true;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          const tr = view.state.tr;
          tr.setMeta('slashCommand', { type: 'hide' });
          view.dispatch(tr);
          return true;
        }

        return false;
      },
    },
  });
}
