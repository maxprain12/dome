import { Node, mergeAttributes } from '@tiptap/core';
import type { DividerAttributes } from '@/types';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    setDivider: (attributes?: DividerAttributes) => ReturnType;
  }
}

export const StyledDivider = Node.create({
  name: 'styledDivider',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      variant: {
        default: 'line' as const,
        parseHTML: (el) => el.getAttribute('data-variant') ?? 'line',
        renderHTML: (attrs) => ({ 'data-variant': attrs.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'hr[data-type="styled-divider"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const v = node.attrs.variant ?? 'line';
    return [
      'hr',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'styled-divider',
        class: `dome-styled-divider dome-styled-divider--${v}`,
      }),
    ];
  },

  addCommands() {
    return {
      setDivider:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { variant: attributes.variant ?? 'line' },
          }),
    };
  },
});
