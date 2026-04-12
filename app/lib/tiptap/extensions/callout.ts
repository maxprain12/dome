import { Node, mergeAttributes } from '@tiptap/core';
import type { CalloutBlockAttributes } from '@/types';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    setCallout: (attributes?: CalloutBlockAttributes) => ReturnType;
  }
}

export const Callout = Node.create({
  name: 'callout',

  group: 'block',

  content: 'block+',

  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'info',
        parseHTML: (el) => el.getAttribute('data-variant') ?? 'info',
        renderHTML: (attrs) => ({ 'data-variant': attrs.variant }),
      },
      icon: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-icon'),
        renderHTML: (attrs) => (attrs.icon ? { 'data-icon': attrs.icon } : {}),
      },
      color: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-color'),
        renderHTML: (attrs) => (attrs.color ? { 'data-color': attrs.color } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const v = node.attrs.variant ?? 'info';
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'callout',
        class: `dome-callout dome-callout--${v}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              variant: attributes.variant ?? 'info',
              icon: attributes.icon ?? null,
              color: attributes.color ?? null,
            },
            content: [{ type: 'paragraph' }],
          }),
    };
  },
});
