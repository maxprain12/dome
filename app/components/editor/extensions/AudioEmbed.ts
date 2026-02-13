import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { AudioEmbedAttributes } from '@/types';
import { AudioEmbedBlock } from '../blocks/AudioEmbedBlock';

export const AudioEmbedExtension = Node.create({
  name: 'audioEmbed',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-src'),
        renderHTML: (attributes) => ({
          'data-src': attributes.src || '',
        }),
      },
      isLocal: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-is-local') === 'true',
        renderHTML: (attributes) => ({
          'data-is-local': attributes.isLocal ? 'true' : 'false',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="audio-embed"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as AudioEmbedAttributes;
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'audio-embed',
        'data-src': attrs.src,
        'data-is-local': attrs.isLocal ? 'true' : 'false',
        class: 'audio-embed-block',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioEmbedBlock as any);
  },

  addCommands() {
    return {
      setAudioEmbed:
        (attributes: AudioEmbedAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },
});
