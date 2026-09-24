import { Node, mergeAttributes } from '@tiptap/core';
import type { JSONContent, MarkdownRendererHelpers } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, ArrowDown01Icon, BulbIcon, InformationCircleIcon, Note01Icon, QuoteUpIcon } from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react';

const CALLOUT_TYPES = ['note', 'tip', 'info', 'warning', 'danger', 'quote'] as const;
type CalloutType = (typeof CALLOUT_TYPES)[number];

function isCalloutType(value: string): value is CalloutType {
  return (CALLOUT_TYPES as readonly string[]).includes(value);
}

function calloutIcon(type: CalloutType): IconSvgElement {
  switch (type) {
    case 'tip':
      return BulbIcon;
    case 'info':
      return InformationCircleIcon;
    case 'warning':
      return Alert02Icon;
    case 'danger':
      return Alert02Icon;
    case 'quote':
      return QuoteUpIcon;
    case 'note':
      return Note01Icon;
    default: {
      const exhausted: never = type;
      return exhausted;
    }
  }
}

function renderCallout(node: JSONContent, helpers: MarkdownRendererHelpers): string {
  const type = String(node.attrs?.type || 'note');
  const fold = node.attrs?.collapsed ? '-' : '';
  const title = String(node.attrs?.title || '').trim();
  const header = `> [!${type}]${fold}${title ? ` ${title}` : ''}`;
  const body = helpers.renderChildren(node.content || []).replace(/\n+$/, '');
  const quoted = (body || '').split('\n').map((line) => `> ${line}`).join('\n');
  return `${header}\n${quoted}`;
}

function CalloutView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const { t } = useTranslation();
  const rawType = String(node.attrs.type || 'note');
  const type: CalloutType = isCalloutType(rawType) ? rawType : 'note';
  const collapsed = Boolean(node.attrs.collapsed);
  const title = String(node.attrs.title || '');
  return (
    <NodeViewWrapper className={`note-callout note-callout--${type}`} data-callout={type} data-collapsed={collapsed ? 'true' : 'false'}>
      <div className="note-callout-header" contentEditable={false}>
        <HugeiconsIcon icon={calloutIcon(type)} size={16} />
        <select
          aria-label={t('notes.callout_type')}
          value={type}
          disabled={!editor.isEditable}
          onChange={(event) => updateAttributes({ type: event.target.value })}
        >
          {CALLOUT_TYPES.map((item) => <option key={item} value={item}>{t(`notes.callout_${item}`)}</option>)}
        </select>
        <input
          value={title}
          disabled={!editor.isEditable}
          placeholder={t(`notes.callout_${type}`)}
          aria-label={t('notes.callout_title')}
          onChange={(event) => updateAttributes({ title: event.target.value })}
        />
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={t('notes.callout_toggle')}
          onClick={() => updateAttributes({ collapsed: !collapsed })}
        >
          <HugeiconsIcon icon={ArrowDown01Icon} size={14} className={collapsed ? '-rotate-90' : ''} />
        </button>
      </div>
      <NodeViewContent className="note-callout-body" />
    </NodeViewWrapper>
  );
}

export function calloutExtension() {
  return Node.create({
    name: 'callout',
    group: 'block',
    content: 'block+',
    defining: true,
    addAttributes() {
      return {
        type: { default: 'note' },
        title: { default: '' },
        collapsed: { default: false },
      };
    },
    parseHTML() {
      return [{ tag: 'div[data-callout]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': HTMLAttributes.type || 'note' }), 0];
    },
    addNodeView() {
      return ReactNodeViewRenderer(CalloutView);
    },
    markdownTokenizer: {
      name: 'callout',
      level: 'block',
      start: (src: string) => {
        const match = /^> \[!/m.exec(src);
        return match ? match.index : -1;
      },
      tokenize: (src, _tokens, lexer) => {
        const match = /^> \[!([A-Za-z]+)\]([+-])?[ \t]*([^\n]*)(?:\n((?:> ?[^\n]*(?:\n|$))*))?/.exec(src);
        if (!match) return undefined;
        const body = (match[4] || '').split('\n').map((line) => line.replace(/^> ?/, '')).join('\n').trim();
        return {
          type: 'callout',
          raw: match[0],
          calloutType: match[1].toLowerCase(),
          collapsed: match[2] === '-',
          title: match[3].trim(),
          tokens: body ? lexer.blockTokens(body) : [],
        };
      },
    },
    parseMarkdown: (token, helpers) => {
      const children = helpers.parseChildren(token.tokens || []);
      return {
        type: 'callout',
        attrs: {
          type: typeof token.calloutType === 'string' ? token.calloutType : 'note',
          title: typeof token.title === 'string' ? token.title : '',
          collapsed: Boolean(token.collapsed),
        },
        content: children.length > 0 ? children : [{ type: 'paragraph' }],
      };
    },
    renderMarkdown: renderCallout,
  });
}
