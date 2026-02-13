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

export function createSlashCommandPlugin(items: SlashCommandItem[], editor?: import('@tiptap/core').Editor) {
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
        // Process meta first (ArrowUp/Down, Escape)
        const meta = tr.getMeta('slashCommand');
        if (meta) {
          if (meta.type === 'updateSelectedIndex' && typeof meta.index === 'number') {
            return { ...value, selectedIndex: meta.index };
          }
          if (meta.type === 'hide') {
            return {
              show: false,
              items: [],
              selectedIndex: 0,
              query: '',
              range: null,
            };
          }
        }

        const { selection, doc } = newState;
        const { $anchor } = selection;
        const blockStart = $anchor.start();
        const textBeforeCursor = doc.textBetween(blockStart, $anchor.pos, '\n', '\0');

        const lastChar = textBeforeCursor.slice(-1);
        const charBeforeSlash = textBeforeCursor.slice(-2, -1);
        const isValidSlashTrigger =
          lastChar === '/' &&
          (textBeforeCursor === '/' || charBeforeSlash === ' ' || charBeforeSlash === '\n' || $anchor.parentOffset === 0);

        if (isValidSlashTrigger) {
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
          const match = textBeforeCursor.match(/\/([^\s]*)$/);
          if (match && match[1] !== undefined) {
            const query = match[1].toLowerCase();
            const filteredItems = items
              .filter((item) => {
                const title = item.title.toLowerCase();
                const titleMatch = title.includes(query) || (query.length >= 2 && title.startsWith(query));
                const keywordMatch = item.keywords?.some(
                  (kw) => kw.toLowerCase().includes(query) || (query.length >= 2 && kw.toLowerCase().startsWith(query))
                );
                const categoryMatch = item.category?.toLowerCase().includes(query);
                return titleMatch || keywordMatch || categoryMatch;
              })
              .sort((a, b) => {
                const aTitle = a.title.toLowerCase();
                const bTitle = b.title.toLowerCase();
                const aStarts = aTitle.startsWith(query) || a.keywords?.some((k) => k.toLowerCase().startsWith(query));
                const bStarts = bTitle.startsWith(query) || b.keywords?.some((k) => k.toLowerCase().startsWith(query));
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;
                return aTitle.localeCompare(bTitle);
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
        if (value.show && (lastChar !== '/' && !textBeforeCursor.match(/\/([^\s]*)$/))) {
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
          if (item && state.range && editor) {
            item.command({
              editor,
              range: state.range,
            });
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
