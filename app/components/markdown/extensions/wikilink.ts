import { InputRule } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import { PluginKey } from '@tiptap/pm/state';
import type { JSONContent } from '@tiptap/core';
import i18n from '@/lib/i18n';
import { looksLikeOpaqueId } from '@/lib/social/socialQueues';
import { openDomeHref } from '@/lib/links/openDomeHref';
import { renderSuggestion } from '../menus/suggestion-renderer';
import type { MenuEntry } from '../menus/menu-types';

export function wikilinkLabel(label: unknown, target: unknown): string {
  const alias = typeof label === 'string' ? label.trim() : '';
  const title = typeof target === 'string' ? target.trim() : '';
  const text = alias || title;
  if (!text || looksLikeOpaqueId(text)) return i18n.t('notes.wikilink_untitled');
  return text;
}

async function searchWikilinks(query: string): Promise<MenuEntry[]> {
  const q = query.trim();
  const search = window.electron?.db?.resources?.search;
  if (q.length < 1 || !search) return [];
  try {
    const result = await search(q);
    const rows = result?.success && Array.isArray(result.data) ? result.data : [];
    return rows
      .filter((row) => typeof row.title === 'string' && row.title.trim() && !looksLikeOpaqueId(row.title))
      .slice(0, 8)
      .map((row) => ({ id: row.id, label: row.title, keywords: row.title }));
  } catch {
    return [];
  }
}

function renderWikilink(node: JSONContent): string {
  const target = String(node.attrs?.id ?? '').trim();
  const alias = String(node.attrs?.label ?? '').trim();
  if (!target) return '';
  return alias && alias !== target ? `[[${target}|${alias}]]` : `[[${target}]]`;
}

/** Obsidian wikilinks `[[Note]]` and `[[Note|alias]]`, resolved against Dome resources. */
export function wikilinkExtension(options?: { plain?: boolean }) {
  const plain = options?.plain === true;
  const pluginKey = new PluginKey('wikilink');
  return Mention.extend({
    name: 'wikilink',
    addAttributes() {
      return {
        ...this.parent?.(),
        resourceId: {
          default: null,
          rendered: false,
        },
      };
    },
    renderHTML({ node }) {
      const label = plain ? renderWikilink({ attrs: node.attrs }) : wikilinkLabel(node.attrs.label, node.attrs.id);
      return ['span', plain ? { 'data-type': 'wikilink' } : { class: 'note-wikilink', 'data-type': 'wikilink' }, label];
    },
    markdownTokenizer: {
      name: 'wikilink',
      level: 'inline',
      start: (src: string) => src.indexOf('[['),
      tokenize: (src: string) => {
        const match = /^\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/.exec(src);
        const target = match?.[1]?.trim();
        if (!match || !target) return undefined;
        return {
          type: 'wikilink',
          raw: match[0],
          target,
          alias: match[2]?.trim() || null,
        };
      },
    },
    parseMarkdown: (token) => ({
      type: 'wikilink',
      attrs: {
        id: typeof token.target === 'string' ? token.target : '',
        label: typeof token.alias === 'string' ? token.alias : null,
        resourceId: null,
      },
    }),
    renderMarkdown: renderWikilink,
    addInputRules() {
      return [
        new InputRule({
          find: /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]$/,
          handler: ({ state, range, match }) => {
            const target = match[1]?.trim();
            const type = state.schema.nodes.wikilink;
            if (!target || !type) return;
            const alias = match[2]?.trim() || null;
            state.tr.replaceWith(range.from, range.to, type.create({ id: target, label: alias, resourceId: null }));
          },
        }),
      ];
    },
    addNodeView() {
      return ({ node }) => {
        const dom = document.createElement('span');
        let current = node;
        const paint = () => {
          dom.textContent = plain
            ? renderWikilink({ attrs: current.attrs })
            : wikilinkLabel(current.attrs.label, current.attrs.id);
          if (!plain) dom.className = 'note-wikilink';
        };
        const open = (event: MouseEvent) => {
          if (!(event.metaKey || event.ctrlKey)) return;
          event.preventDefault();
          event.stopPropagation();
          const target = String(current.attrs.id || '');
          const resourceId = typeof current.attrs.resourceId === 'string' ? current.attrs.resourceId : '';
          const href = resourceId
            ? `dome://resource/${resourceId}`
            : `dome://resolve/${encodeURIComponent(target)}`;
          openDomeHref(href).catch(() => { /* The helper reports a toast when the link cannot be opened. */ });
        };
        if (!plain) dom.addEventListener('click', open);
        paint();
        return {
          dom,
          update(next) {
            if (next.type !== node.type) return false;
            current = next;
            paint();
            return true;
          },
          destroy() { if (!plain) dom.removeEventListener('click', open); },
        };
      };
    },
  }).configure({
    renderText: ({ node }) => (plain ? renderWikilink({ attrs: node.attrs }) : wikilinkLabel(node.attrs.label, node.attrs.id)),
    suggestion: {
      char: '[[',
      pluginKey,
      allowSpaces: true,
      allow: () => !plain,
      items: ({ query }) => (plain ? [] : searchWikilinks(query)),
      render: renderSuggestion<MenuEntry>(),
      command: ({ editor, range, props }) => {
        const target = typeof props.label === 'string' ? props.label.trim() : '';
        if (!target) return;
        editor.chain().focus().insertContentAt(range, [
          { type: 'wikilink', attrs: { id: target, label: null, resourceId: props.id } },
          { type: 'text', text: ' ' },
        ]).run();
      },
    },
  });
}
