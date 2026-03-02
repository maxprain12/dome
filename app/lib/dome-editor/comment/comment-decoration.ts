// Copyright (c) 2025 Dome contributors. MIT License.
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { commentDecorationMetaKey, commentMarkClass } from "./comment";

const commentDecorationPluginKey = new PluginKey("commentDecoration");

export function commentDecorationPlugin(): Plugin {
  return new Plugin({
    key: commentDecorationPluginKey,
    state: {
      init() {
        return DecorationSet.empty;
      },
      apply(tr, oldSet) {
        const meta = tr.getMeta(commentDecorationMetaKey);
        if (meta === true) {
          const { from, to } = tr.selection;
          return DecorationSet.create(tr.doc, [
            Decoration.inline(from, to, { class: commentMarkClass }),
          ]);
        }
        if (meta === false) {
          return DecorationSet.empty;
        }
        return oldSet.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return commentDecorationPluginKey.getState(state);
      },
    },
  });
}
