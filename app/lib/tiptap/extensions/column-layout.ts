import { Extension, Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    insertTwoColumns: () => ReturnType;
    insertThreeColumns: () => ReturnType;
  }
}

const columnChild = (content: unknown[] = [{ type: 'paragraph' }]) => ({
  type: 'column',
  content,
});

export const Column = Node.create({
  name: 'column',

  group: 'layoutColumn',

  content: 'block+',

  defining: true,

  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'column',
        class: 'dome-column',
      }),
      0,
    ];
  },
});

export const TwoColumnLayout = Node.create({
  name: 'twoColumnLayout',

  group: 'block',

  content: 'column column',

  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="two-column-layout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'two-column-layout',
        class: 'dome-column-layout dome-column-layout--2',
      }),
      0,
    ];
  },
});

export const ThreeColumnLayout = Node.create({
  name: 'threeColumnLayout',

  group: 'block',

  content: 'column column column',

  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="three-column-layout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'three-column-layout',
        class: 'dome-column-layout dome-column-layout--3',
      }),
      0,
    ];
  },
});

export const ColumnLayoutCommands = Extension.create({
  name: 'columnLayoutCommands',

  addCommands() {
    return {
      insertTwoColumns:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: 'twoColumnLayout',
            content: [columnChild(), columnChild()],
          }),
      insertThreeColumns:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: 'threeColumnLayout',
            content: [columnChild(), columnChild(), columnChild()],
          }),
    };
  },
});
