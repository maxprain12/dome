import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TableKit } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import { CharacterCount } from '@tiptap/extensions';
import { TableOfContents } from '@tiptap/extension-table-of-contents';
import FileHandler from '@tiptap/extension-file-handler';
import { calloutExtension } from './callout';
import { codeBlockExtension } from './code-block';
import { detailsExtensions } from './details-md';
import { mathematicsExtension } from './math';
import { mediaImage } from './media-image';
import { slashExtension } from './slash';
import { extensionContext, type NoteEditorProfile, type NoteExtensionContext, type NoteOutlineItem } from './types';
import { wikilinkExtension } from './wikilink';
import { youtubeExtension } from './youtube-embed';

const highlight = Highlight.extend({
  addKeyboardShortcuts() {
    return { 'Mod-Shift-h': () => this.editor.commands.toggleHighlight() };
  },
});

function headingSlug(text: string): string {
  const slug = text.trim().toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return slug || 'section';
}

function tocExtension(ctx: NoteExtensionContext) {
  const seen = new Map<string, number>();
  return TableOfContents.configure({
    scrollParent: () => {
      const node = document.querySelector('.note-scroll');
      return node instanceof HTMLElement ? node : window;
    },
    getId: (text) => {
      const base = headingSlug(text);
      const next = (seen.get(base) ?? 0) + 1;
      seen.set(base, next);
      return next === 1 ? base : `${base}-${next}`;
    },
    onUpdate: (data) => {
      const items: NoteOutlineItem[] = data
        .filter((item) => item.textContent.trim())
        .map((item) => ({
          id: item.id,
          level: item.originalLevel || item.level,
          text: item.textContent,
          pos: item.pos,
        }));
      queueMicrotask(() => ctx.onOutline(items));
    },
  });
}

export function noteExtensions(profile: NoteEditorProfile = 'note', overrides?: Partial<NoteExtensionContext>) {
  const ctx = extensionContext(profile, overrides);
  return [
    StarterKit.configure({
      underline: false,
      codeBlock: false,
      link: { openOnClick: false, protocols: ['dome'], autolink: false },
    }),
    Markdown.configure({ markedOptions: { gfm: true } }),
    Placeholder.configure({
      placeholder: ({ editor, node }) => (editor.isEditable && node.type.name === 'paragraph' ? ctx.placeholder() : ''),
      showOnlyCurrent: true,
    }),
    CharacterCount.configure({ limit: null }),
    highlight,
    Typography,
    codeBlockExtension(),
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    mediaImage(ctx.siteImages, ctx.siteUrl, ctx.refreshers),
    youtubeExtension(),
    ...detailsExtensions(),
    ...(profile === 'cms' ? [] : [calloutExtension(), mathematicsExtension(ctx)]),
    ...(profile === 'note' ? [wikilinkExtension(), tocExtension(ctx)] : []),
    ...(profile === 'cms' ? [wikilinkExtension({ plain: true })] : []),
    FileHandler.configure({
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
      consumePasteEvent: true,
      onPaste: (_editor, files) => { ctx.uploadImages(files); },
      onDrop: (_editor, files, pos) => { ctx.uploadImages(files, pos); },
    }),
    slashExtension(ctx),
  ];
}

/** Syntax outside the visual schema remains editable verbatim in source mode. */
export function needsSourceEditor(markdown: string): boolean {
  const prose = markdown
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '')
    .replace(/<details[\s\S]*?<\/details>/gi, '')
    .replace(/\$\$[\s\S]+?\$\$/g, '')
    .replace(/(?<!\$)\$[^$\n]+\$(?!\$)/g, '');
  return /<\/?[A-Za-z][^>]*>|<!--|^:::|^\[\^|^---\s*\n|^(?:import|export)\s|\{[^}\n]+\}/m.test(prose);
}

export type { NoteEditorProfile, NoteExtensionContext, NoteOutlineItem };
