import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { ResourceMentionAttributes, ResourceType } from '@/types';
import { ResourceMentionBlock } from '../blocks/ResourceMentionBlock';

export const ResourceMentionExtension = Node.create({
  markdownTokenizer: {
    name: 'resourceMention',
    level: 'inline' as const,
    start: (src) => src.indexOf('@['),
    tokenize: (src, _tokens, lexer) => {
      const match = /^@\[([^\]]*)\]\(([^)\s]+)\)/.exec(src);
      if (!match) return undefined;
      return {
        type: 'resourceMention',
        raw: match[0],
        label: match[1] || '',
        resourceId: match[2] || '',
      };
    },
  },

  parseMarkdown: (token, _helpers) => ({
    type: 'resourceMention',
    attrs: {
      resourceId: token.resourceId || '',
      title: token.label || 'Resource',
      type: 'note' as ResourceType,
      label: token.label || '',
    },
  }),

  renderMarkdown: (node) => {
    const attrs = node.attrs as ResourceMentionAttributes & { label?: string };
    const label = attrs?.title || attrs?.label || 'Resource';
    const id = attrs?.resourceId || '';
    return `@[${label}](${id})`;
  },
  name: 'resourceMention',

  group: 'inline',

  inline: true,

  atom: true,

  addAttributes() {
    return {
      resourceId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-resource-id'),
        renderHTML: (attributes) => {
          if (!attributes.resourceId) {
            return {};
          }
          return {
            'data-resource-id': attributes.resourceId,
          };
        },
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-title') || element.textContent,
        renderHTML: (attributes) => {
          return {
            'data-title': attributes.title || '',
          };
        },
      },
      type: {
        default: 'note',
        parseHTML: (element) => element.getAttribute('data-resource-type') as ResourceType,
        renderHTML: (attributes) => {
          return {
            'data-resource-type': attributes.type || 'note',
          };
        },
      },
      label: {
        default: '',
        parseHTML: (element) => element.textContent,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="resource-mention"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          return {
            resourceId: node.getAttribute('data-resource-id'),
            title: node.getAttribute('data-title') || node.textContent,
            type: node.getAttribute('data-resource-type') as ResourceType,
            label: node.textContent,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as ResourceMentionAttributes & { label: string };
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'resource-mention',
        'data-resource-id': attrs.resourceId,
        'data-resource-type': attrs.type,
        'data-title': attrs.title,
        class: 'resource-mention',
      }),
      attrs.label || attrs.title || 'Resource',
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResourceMentionBlock as any);
  },
});
