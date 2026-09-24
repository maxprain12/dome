import type { Editor, Range } from '@tiptap/core';
import {
  AiMagicIcon,
  CodeIcon,
  FunctionIcon,
  Heading01Icon,
  Heading02Icon,
  Heading03Icon,
  Image01Icon,
  InformationCircleIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  Menu01Icon,
  MinusSignIcon,
  QuoteUpIcon,
  TableIcon,
  Task01Icon,
  TextIcon,
  UnfoldMoreIcon,
  YoutubeIcon,
} from '@hugeicons/core-free-icons';
import i18n from '@/lib/i18n';
import type { NoteExtensionContext } from '../extensions/types';
import type { MenuEntry } from './menu-types';

function clear(editor: Editor, range: Range) {
  return editor.chain().focus().deleteRange(range);
}

function headingItem(level: 1 | 2 | 3, icon: MenuEntry['icon']): MenuEntry {
  return {
    id: `h${level}`,
    label: i18n.t(`notes.slash_item_h${level}`),
    keywords: `h${level} heading titulo`,
    group: i18n.t('notes.slash_group_text'),
    icon,
    run: (editor, range) => { clear(editor, range).toggleHeading({ level }).run(); },
  };
}

export function slashItems(ctx: NoteExtensionContext): MenuEntry[] {
  const text = i18n.t('notes.slash_group_text');
  const list = i18n.t('notes.slash_group_list');
  const media = i18n.t('notes.slash_group_media');
  const advanced = i18n.t('notes.slash_group_advanced');
  const dome = i18n.t('notes.slash_group_dome');
  const items: MenuEntry[] = [
    { id: 'text', label: i18n.t('notes.slash_item_text'), keywords: 'paragraph texto', group: text, icon: TextIcon, run: (editor, range) => { clear(editor, range).setParagraph().run(); } },
    headingItem(1, Heading01Icon),
    headingItem(2, Heading02Icon),
    headingItem(3, Heading03Icon),
    { id: 'quote', label: i18n.t('notes.slash_item_quote'), keywords: 'blockquote cita', group: text, icon: QuoteUpIcon, run: (editor, range) => { clear(editor, range).toggleBlockquote().run(); } },
    { id: 'callout', label: i18n.t('notes.slash_item_callout'), keywords: 'admonition aviso note warning', group: text, icon: InformationCircleIcon, profiles: ['note', 'embedded'], run: (editor, range) => { clear(editor, range).insertContent({ type: 'callout', attrs: { type: 'note', title: '', collapsed: false }, content: [{ type: 'paragraph' }] }).run(); } },
    { id: 'divider', label: i18n.t('notes.slash_item_divider'), keywords: 'hr rule', group: text, icon: MinusSignIcon, run: (editor, range) => { clear(editor, range).setHorizontalRule().run(); } },
    { id: 'bullet', label: i18n.t('notes.slash_item_bullet'), keywords: 'ul list', group: list, icon: LeftToRightListBulletIcon, run: (editor, range) => { clear(editor, range).toggleBulletList().run(); } },
    { id: 'ordered', label: i18n.t('notes.slash_item_ordered'), keywords: 'ol numbered', group: list, icon: LeftToRightListNumberIcon, run: (editor, range) => { clear(editor, range).toggleOrderedList().run(); } },
    { id: 'task', label: i18n.t('notes.slash_item_task'), keywords: 'todo checkbox', group: list, icon: Task01Icon, run: (editor, range) => { clear(editor, range).toggleTaskList().run(); } },
    { id: 'image', label: i18n.t('notes.slash_item_image'), keywords: 'picture photo', group: media, icon: Image01Icon, run: (editor, range) => { clear(editor, range).run(); ctx.pickImage(); } },
    { id: 'youtube', label: i18n.t('notes.slash_item_youtube'), keywords: 'video embed', group: media, icon: YoutubeIcon, run: (_editor, range) => ctx.insertYoutube(range) },
    { id: 'code', label: i18n.t('notes.slash_item_code'), keywords: 'pre fence', group: advanced, icon: CodeIcon, run: (editor, range) => { clear(editor, range).toggleCodeBlock().run(); } },
    { id: 'table', label: i18n.t('notes.slash_item_table'), keywords: 'grid', group: advanced, icon: TableIcon, run: (editor, range) => { clear(editor, range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); } },
    { id: 'math', label: i18n.t('notes.slash_item_math'), keywords: 'latex equation katex', group: advanced, icon: FunctionIcon, profiles: ['note', 'embedded'], run: (_editor, range) => ctx.openMath({ latex: '', pos: range.from, kind: 'block', create: true, range }) },
    { id: 'details', label: i18n.t('notes.slash_item_details'), keywords: 'toggle collapse summary', group: advanced, icon: UnfoldMoreIcon, run: (editor, range) => { clear(editor, range).setDetails().run(); } },
    { id: 'toc', label: i18n.t('notes.slash_item_toc'), keywords: 'outline index contents', group: advanced, icon: Menu01Icon, run: insertOutline },
    { id: 'wikilink', label: i18n.t('notes.slash_item_wikilink'), keywords: 'link note mention', group: dome, icon: Link01Icon, profiles: ['note'], run: (editor, range) => { clear(editor, range).insertContent('[[').run(); } },
    { id: 'ai', label: i18n.t('notes.slash_item_ai'), keywords: 'many improve', group: dome, icon: AiMagicIcon, run: (editor, range) => ctx.askAi(editor, range) },
  ];
  return items.filter((item) => !item.profiles || item.profiles.includes(ctx.profile));
}

function insertOutline(editor: Editor, range: Range) {
  const lines: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'heading') return;
    const text = node.textContent.trim();
    if (!text) return;
    const level = Number(node.attrs.level) || 1;
    lines.push(`${'  '.repeat(Math.max(0, level - 1))}- ${text}`);
  });
  const chain = clear(editor, range);
  if (lines.length > 0) chain.insertContent(lines.join('\n'));
  chain.run();
}

function fold(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

export function filterSlashItems(query: string, ctx: NoteExtensionContext): MenuEntry[] {
  const q = fold(query.trim());
  const aiReady = typeof window !== 'undefined' && typeof window.electron?.invoke === 'function';
  return slashItems(ctx).filter((item) => {
    if (item.id === 'ai' && !aiReady) return false;
    if (!q) return true;
    return fold(`${item.id} ${item.label} ${item.keywords || ''}`).includes(q);
  });
}
