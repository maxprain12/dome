import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { FileBlockAttributes } from '@/types';
import { FileBlock as FileBlockComponent } from '../blocks/FileBlock';

export const FileBlockExtension = Node.create({
  name: 'fileBlock',

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
      filename: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-filename'),
        renderHTML: (attributes) => {
          return {
            'data-filename': attributes.filename || '',
          };
        },
      },
      mimeType: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-mime-type'),
        renderHTML: (attributes) => {
          if (!attributes.mimeType) {
            return {};
          }
          return {
            'data-mime-type': attributes.mimeType,
          };
        },
      },
      size: {
        default: null,
        parseHTML: (element) => {
          const val = element.getAttribute('data-size');
          return val ? parseInt(val) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.size) {
            return {};
          }
          return {
            'data-size': String(attributes.size),
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="file-block"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as FileBlockAttributes;
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'file-block',
        'data-resource-id': attrs.resourceId,
        'data-filename': attrs.filename,
        'data-mime-type': attrs.mimeType,
        'data-size': attrs.size ? String(attrs.size) : undefined,
        class: 'file-block',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileBlockComponent);
  },

  addCommands() {
    return {
      setFileBlock:
        (attributes: FileBlockAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },
});
