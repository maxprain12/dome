import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    iframeEmbed: {
      insertIframeEmbed: (attrs: { src: string; width?: string | null; height?: string | null }) => ReturnType;
    };
  }
}

export const IframeEmbed = Node.create({
  name: 'iframeEmbed',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).querySelector('iframe')?.getAttribute('src') ?? '',
        renderHTML: (attrs) => (attrs.src ? {} : {}),
      },
      width: {
        default: '100%',
        parseHTML: (el) => (el as HTMLElement).querySelector('iframe')?.getAttribute('width') ?? '100%',
        renderHTML: () => ({}),
      },
      height: {
        default: '400',
        parseHTML: (el) => (el as HTMLElement).querySelector('iframe')?.getAttribute('height') ?? '400',
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="iframe-embed"]',
        getAttrs: (el) => {
          const iframe = (el as HTMLElement).querySelector('iframe');
          if (!iframe) return false;
          return {
            src: iframe.getAttribute('src') ?? '',
            width: iframe.getAttribute('width') ?? '100%',
            height: iframe.getAttribute('height') ?? '400',
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { src, width, height } = node.attrs;
    return [
      'div',
      { 'data-type': 'iframe-embed', class: 'dome-iframe-embed-wrapper' },
      [
        'iframe',
        mergeAttributes(
          {
            src,
            class: 'dome-iframe-embed',
            width: width || '100%',
            height: height || '400',
            sandbox:
              'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox',
            loading: 'lazy',
            referrerpolicy: 'no-referrer-when-downgrade',
          },
          {},
        ),
      ],
    ];
  },

  addCommands() {
    return {
      insertIframeEmbed:
        (attrs: { src: string; width?: string | null; height?: string | null }) =>
        ({ commands }: CommandProps) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              src: attrs.src,
              width: attrs.width ?? '100%',
              height: attrs.height ?? '400',
            },
          }),
    };
  },
});
