import type { JSONContent, MarkdownRendererHelpers, MarkdownTokenizer } from '@tiptap/core';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeHtml(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function renderDetails(node: JSONContent, helpers: MarkdownRendererHelpers): string {
  const open = node.attrs?.open ? ' open' : '';
  const summary = node.content?.find((child) => child.type === 'detailsSummary');
  const body = node.content?.find((child) => child.type === 'detailsContent');
  const summaryText = escapeHtml(helpers.renderChildren(summary?.content || []).replace(/\n/g, ' ').trim());
  const bodyText = helpers.renderChildren(body?.content || []).replace(/\n+$/, '');
  return `<details${open}>\n<summary>${summaryText}</summary>\n\n${bodyText}\n</details>`;
}

const detailsTokenizer = {
  name: 'details',
  level: 'block' as const,
  start: (src: string) => {
    const match = /<details\b/i.exec(src);
    return match ? match.index : -1;
  },
  tokenize: (src, _tokens, lexer) => {
    const match = /^<details(\s+open(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)?\s*>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)<\/details>/i.exec(src);
    if (!match) return undefined;
    const body = match[3].trim();
    return {
      type: 'details',
      raw: match[0],
      open: Boolean(match[1]),
      summary: decodeHtml(match[2].trim()),
      tokens: body ? lexer.blockTokens(body) : [],
    };
  },
} satisfies MarkdownTokenizer;

/** Folding blocks stored as HTML `<details>`, which Astro and browsers already understand. */
export function detailsExtensions() {
  const details = Details.extend({
    markdownTokenizer: detailsTokenizer,
    parseMarkdown: (token, helpers) => {
      const children = helpers.parseChildren(token.tokens || []);
      const summary = typeof token.summary === 'string' ? token.summary : '';
      return {
        type: 'details',
        attrs: { open: Boolean(token.open) },
        content: [
          {
            type: 'detailsSummary',
            content: summary ? [{ type: 'text', text: summary }] : [],
          },
          {
            type: 'detailsContent',
            content: children.length > 0 ? children : [{ type: 'paragraph' }],
          },
        ],
      };
    },
    renderMarkdown: renderDetails,
  }).configure({ persist: true });
  return [details, DetailsSummary, DetailsContent];
}
