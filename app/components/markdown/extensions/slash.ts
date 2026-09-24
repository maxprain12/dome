import { Extension, type Range } from '@tiptap/core';
import { findSuggestionMatch } from '@tiptap/suggestion';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { filterSlashItems } from '../menus/slash-items';
import { renderSuggestion } from '../menus/suggestion-renderer';
import type { MenuEntry } from '../menus/menu-types';
import type { NoteExtensionContext } from './types';

function slashMatch(state: EditorState) {
  if (!state.selection.empty) return null;
  return findSuggestionMatch({
    char: '/',
    allowSpaces: false,
    allowToIncludeChar: false,
    allowedPrefixes: null,
    startOfLine: false,
    $position: state.selection.$from,
  });
}

export function slashExtension(ctx: NoteExtensionContext) {
  return Extension.create({
    name: 'noteSlash',
    addProseMirrorPlugins() {
      const editor = this.editor;
      const lifecycle = renderSuggestion<MenuEntry>()();
      let shown = false;
      let dismissed = '';

      const hide = () => {
        if (!shown) return;
        shown = false;
        lifecycle.onExit?.();
      };

      const sync = (view: EditorView) => {
        const match = slashMatch(view.state);
        if (!match || !editor.isEditable || dismissed === match.text) {
          if (!match || dismissed !== match?.text) dismissed = '';
          hide();
          return;
        }
        const props = {
          editor,
          range: match.range,
          query: match.query,
          items: filterSlashItems(match.query, ctx),
          command: (item: MenuEntry) => { item.run?.(editor, match.range); },
          clientRect: () => {
            try {
              const coords = view.coordsAtPos(match.range.to);
              return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
            } catch {
              return null;
            }
          },
        };
        if (shown) lifecycle.onUpdate?.(props);
        else {
          shown = true;
          lifecycle.onStart?.(props);
        }
      };

      return [
        new Plugin({
          key: new PluginKey('noteSlash'),
          view: () => ({
            update: (view) => sync(view),
            destroy: () => hide(),
          }),
          props: {
            handleKeyDown: (view, event) => {
              if (!shown) return false;
              if (event.key === 'Escape' || event.key === 'Esc') {
                dismissed = slashMatch(view.state)?.text ?? '/';
                hide();
                return true;
              }
              const range: Range = slashMatch(view.state)?.range ?? { from: 0, to: 0 };
              return lifecycle.onKeyDown?.({ view, event, range }) ?? false;
            },
          },
        }),
      ];
    },
  });
}
