import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const DragHandleExtension = Extension.create({
  name: 'dragHandle',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('dragHandle'),
        view() {
          return {
            update() {
              // Drag handle logic will be handled by React component
            },
          };
        },
      }),
    ];
  },
});
