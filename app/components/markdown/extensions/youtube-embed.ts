import type { JSONContent } from '@tiptap/core';
import Youtube, { isValidYoutubeUrl } from '@tiptap/extension-youtube';

function renderYoutube(node: JSONContent): string {
  const src = String(node.attrs?.src ?? '');
  return src ? `![](${src})` : '';
}

/** Obsidian-style embeds `![](https://youtube.com/watch?v=…)` as a video block. */
export function youtubeExtension() {
  return Youtube.extend({
    markdownTokenizer: {
      name: 'youtube',
      level: 'block',
      start: (src: string) => src.indexOf('!['),
      tokenize: (src: string) => {
        const match = /^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)[ \t]*(?:\n|$)/.exec(src);
        if (!match || !isValidYoutubeUrl(match[2])) return undefined;
        return { type: 'youtube', raw: match[0], href: match[2] };
      },
    },
    parseMarkdown: (token) => ({
      type: 'youtube',
      attrs: { src: typeof token.href === 'string' ? token.href : '' },
    }),
    renderMarkdown: renderYoutube,
  }).configure({
    width: '100%',
    height: 360,
    nocookie: true,
    HTMLAttributes: { class: 'note-youtube' },
  });
}

export { isValidYoutubeUrl };
