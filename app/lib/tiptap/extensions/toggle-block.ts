import { Node, mergeAttributes } from '@tiptap/core';
import type { ToggleBlockAttributes } from '@/types';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    setToggle: (attributes?: ToggleBlockAttributes) => ReturnType;
  }
}

export const ToggleBlock = Node.create({
  name: 'toggleBlock',

  group: 'block',

  content: 'toggleSummary toggleBody',

  defining: true,

  addAttributes() {
    return {
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-collapsed') === 'true',
        renderHTML: (attrs) => ({ 'data-collapsed': attrs.collapsed ? 'true' : 'false' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle-block"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'toggle-block',
        class: 'dome-toggle-block',
        'data-collapsed': node.attrs.collapsed ? 'true' : 'false',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setToggle:
        (attrs = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { collapsed: attrs.collapsed ?? false },
            content: [
              {
                type: 'toggleSummary',
                content: [{ type: 'text', text: 'Toggle' }],
              },
              { type: 'toggleBody', content: [{ type: 'paragraph' }] },
            ],
          }),
    };
  },
});

export const ToggleSummary = Node.create({
  name: 'toggleSummary',
  group: 'togglePart',
  content: 'inline*',
  defining: true,
  isolating: true,
  parseHTML() {
    return [{ tag: 'div[data-type="toggle-summary"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'toggle-summary',
        class: 'dome-toggle-summary',
      }),
      0,
    ];
  },
});

export const ToggleBody = Node.create({
  name: 'toggleBody',
  group: 'togglePart',
  content: 'block+',
  defining: true,
  isolating: true,
  parseHTML() {
    return [{ tag: 'div[data-type="toggle-body"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'toggle-body',
        class: 'dome-toggle-body',
      }),
      0,
    ];
  },
});
