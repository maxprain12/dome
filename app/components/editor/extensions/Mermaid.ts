import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MermaidBlock } from '../blocks/MermaidBlock';

export const MermaidExtension = Node.create({
  name: 'mermaid',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      code: {
        default: 'graph TD\n  A[Start] --> B[End]',
        parseHTML: (element) => {
          const pre = element.querySelector('pre');
          if (pre) return pre.textContent?.trim() ?? '';
          return element.getAttribute('data-code') ?? element.textContent?.trim() ?? '';
        },
        renderHTML: (attributes) => {
          if (!attributes.code) return {};
          return { 'data-code': attributes.code };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const code = node.attrs.code ?? '';
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'mermaid',
        'data-code': code,
        class: 'mermaid-block',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidBlock as any);
  },

  addCommands() {
    return {
      setMermaid:
        (attributes?: { code?: string }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { code: attributes?.code ?? 'graph TD\n  A[Start] --> B[End]' },
          });
        },
    };
  },
});
