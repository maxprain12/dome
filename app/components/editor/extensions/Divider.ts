import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { DividerAttributes } from '@/types';
import { DividerBlock } from '../blocks/DividerBlock';

export const DividerExtension = Node.create({
  name: 'divider',

  addOptions() {
    return {
      HTMLAttributes: {},
      variants: ['line', 'dots', 'space'] as const,
    };
  },

  group: 'block',

  parseHTML() {
    return [
      {
        tag: 'hr[data-type="divider"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'hr',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'divider',
        class: 'divider-block',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DividerBlock as any);
  },

  addCommands() {
    return {
      setDivider:
        (attributes?: DividerAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes || { variant: 'line' },
          });
        },
    };
  },
});
