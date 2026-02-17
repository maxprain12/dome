import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MermaidBlock } from '../blocks/MermaidBlock';

export const MermaidExtension = Node.create({
  markdownTokenizer: {
    name: 'mermaid',
    level: 'block' as const,
    start: (src) => src.indexOf(':::mermaid'),
    tokenize: (src, _tokens, _lexer) => {
      const match = /^:::mermaid\s*\n(?:```mermaid\n)?([\s\S]*?)(?:\n```)?\n:::/.exec(src);
      if (!match) {
        const atomMatch = /^:::mermaid\s*(?:\{([^}]*)\})?\s*:::/.exec(src);
        if (atomMatch) {
          const attrString = atomMatch[1] || '';
          const codeMatch = attrString.match(/code=["']([^"']*)["']/);
          const code = codeMatch ? codeMatch[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<') : 'graph TD\n  A[Start] --> B[End]';
          return { type: 'mermaid', raw: atomMatch[0], attributes: { code } };
        }
        return undefined;
      }
      const code = match[1].trim().replace(/^```mermaid\n?|\n?```$/g, '');
      return {
        type: 'mermaid',
        raw: match[0],
        attributes: { code: code || 'graph TD\n  A[Start] --> B[End]' },
      };
    },
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode('mermaid', { code: token.attributes?.code || token.code || 'graph TD\n  A[Start] --> B[End]' }, []),

  renderMarkdown: (node) => {
    const code = node.attrs?.code || 'graph TD\n  A[Start] --> B[End]';
    return `:::mermaid\n\n\`\`\`mermaid\n${code}\n\`\`\`\n\n:::\n\n`;
  },
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
