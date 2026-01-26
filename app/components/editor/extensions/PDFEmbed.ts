import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { PDFEmbedAttributes } from '@/types';
import { PDFEmbedBlock } from '../blocks/PDFEmbedBlock';

export const PDFEmbedExtension = Node.create({
  name: 'pdfEmbed',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: 'block',

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
      pageStart: {
        default: 1,
        parseHTML: (element) => parseInt(element.getAttribute('data-page-start') || '1'),
        renderHTML: (attributes) => {
          return {
            'data-page-start': String(attributes.pageStart || 1),
          };
        },
      },
      pageEnd: {
        default: null,
        parseHTML: (element) => {
          const val = element.getAttribute('data-page-end');
          return val ? parseInt(val) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.pageEnd) {
            return {};
          }
          return {
            'data-page-end': String(attributes.pageEnd),
          };
        },
      },
      zoom: {
        default: 1.0,
        parseHTML: (element) => parseFloat(element.getAttribute('data-zoom') || '1.0'),
        renderHTML: (attributes) => {
          return {
            'data-zoom': String(attributes.zoom || 1.0),
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="pdf-embed"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as PDFEmbedAttributes;
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'pdf-embed',
        'data-resource-id': attrs.resourceId,
        'data-page-start': String(attrs.pageStart || 1),
        'data-page-end': attrs.pageEnd ? String(attrs.pageEnd) : undefined,
        'data-zoom': String(attrs.zoom || 1.0),
        class: 'pdf-embed-block',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PDFEmbedBlock);
  },

  addCommands() {
    return {
      setPDFEmbed:
        (attributes: PDFEmbedAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },
});
