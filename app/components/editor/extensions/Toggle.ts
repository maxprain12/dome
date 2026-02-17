import { Node, mergeAttributes, createBlockMarkdownSpec } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { ToggleBlockAttributes } from '@/types';
import { ToggleBlock } from '../blocks/ToggleBlock';

const toggleMarkdownSpec = createBlockMarkdownSpec({
  nodeName: 'toggle',
  defaultAttributes: {},
  content: 'block',
});

export const ToggleExtension = Node.create({
  name: 'toggle',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  content: 'block+',

  group: 'block',

  defining: true,

  addAttributes() {
    return {
      collapsed: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes) => {
          if (!attributes.collapsed) {
            return {};
          }
          return {
            'data-collapsed': 'true',
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="toggle"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'toggle',
        class: 'toggle-block',
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleBlock as any);
  },

  ...toggleMarkdownSpec,

  addCommands() {
    return {
      setToggle:
        (attributes?: ToggleBlockAttributes) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, attributes || {});
        },
    };
  },
});
