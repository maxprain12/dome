import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { CalloutBlockAttributes } from '@/types';
import { CalloutBlock } from '../blocks/CalloutBlock';

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

  addCommands() {
    return {
      setCallout:
        (attributes?: CalloutBlockAttributes) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, attributes || { icon: 'lightbulb', color: 'yellow' });
        },
    };
  },
});
