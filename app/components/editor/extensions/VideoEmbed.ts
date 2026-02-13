import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { VideoEmbedAttributes } from '@/types';
import { VideoEmbedBlock } from '../blocks/VideoEmbedBlock';

export const VideoEmbedExtension = Node.create({
  name: 'videoEmbed',

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
      provider: {
        default: 'direct',
        parseHTML: (element) => (element.getAttribute('data-provider') as 'youtube' | 'direct') || 'direct',
        renderHTML: (attributes) => ({
          'data-provider': attributes.provider || 'direct',
        }),
      },
      videoId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-video-id'),
        renderHTML: (attributes) => {
          if (!attributes.videoId) return {};
          return { 'data-video-id': attributes.videoId };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="video-embed"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as VideoEmbedAttributes;
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'video-embed',
        'data-src': attrs.src,
        'data-provider': attrs.provider || 'direct',
        'data-video-id': attrs.videoId ?? undefined,
        class: 'video-embed-block',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoEmbedBlock as any);
  },

  addCommands() {
    return {
      setVideoEmbed:
        (attributes: VideoEmbedAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },
});
