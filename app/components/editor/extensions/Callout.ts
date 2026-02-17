import { Node, mergeAttributes, createBlockMarkdownSpec } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { CalloutBlockAttributes } from '@/types';
import { CalloutBlock } from '../blocks/CalloutBlock';

const calloutMarkdownSpec = createBlockMarkdownSpec({
  nodeName: 'callout',
  defaultAttributes: { icon: 'lightbulb', color: 'yellow' },
  allowedAttributes: ['icon', 'color'],
  content: 'block',
});

export const CalloutExtension = Node.create({
  name: 'callout',

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
      icon: {
        default: 'lightbulb',
        parseHTML: (element) => element.getAttribute('data-icon'),
        renderHTML: (attributes) => {
          if (!attributes.icon) {
            return {};
          }
          return {
            'data-icon': attributes.icon,
          };
        },
      },
      color: {
        default: 'yellow',
        parseHTML: (element) => element.getAttribute('data-color'),
        renderHTML: (attributes) => {
          if (!attributes.color) {
            return {};
          }
          return {
            'data-color': attributes.color,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="callout"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as CalloutBlockAttributes;
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'callout',
        'data-icon': attrs.icon || 'lightbulb',
        'data-color': attrs.color || 'yellow',
        class: 'callout-block',
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutBlock as any);
  },

  ...calloutMarkdownSpec,

  addCommands() {
    return {
      setCallout:
        (attributes?: CalloutBlockAttributes) =>
        ({ commands, state }) => {
          const attrs = attributes || { icon: 'lightbulb', color: 'yellow' };
          const { selection } = state;
          const { $from } = selection;
          const isEmpty =
            selection.empty &&
            ($from.parentOffset === 0 ? $from.parent.textContent.length === 0 : false);

          if (isEmpty || $from.parent.textContent.length === 0) {
            return commands.insertContent({
              type: this.name,
              attrs,
              content: [{ type: 'paragraph', content: [] }],
            });
          }
          return commands.wrapIn(this.name, attrs);
        },
    };
  },
});
