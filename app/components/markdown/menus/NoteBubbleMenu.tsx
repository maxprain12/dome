import { useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { CodeIcon, HighlighterIcon, Link01Icon, TextBoldIcon, TextItalicIcon, TextStrikethroughIcon } from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import NoteAiActions from '../NoteAiActions';
import NoteLinkPopover from './NoteLinkPopover';

function modKey(): string {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform;
  return /Mac|iPhone|iPad/i.test(platform) ? '⌘' : 'Ctrl+';
}

function blockKey(editor: Editor): string {
  if (editor.isActive('heading', { level: 1 })) return 'h1';
  if (editor.isActive('heading', { level: 2 })) return 'h2';
  if (editor.isActive('heading', { level: 3 })) return 'h3';
  if (editor.isActive('taskList')) return 'task';
  if (editor.isActive('bulletList')) return 'bullet';
  if (editor.isActive('orderedList')) return 'ordered';
  if (editor.isActive('blockquote')) return 'quote';
  if (editor.isActive('callout')) return 'callout';
  return 'text';
}

function FormatButton({ label, shortcut, pressed, icon, onClick }: { label: string; shortcut?: string; pressed: boolean; icon: IconSvgElement; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={label} aria-pressed={pressed} onClick={onClick} />}>
        <HugeiconsIcon icon={icon} />
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-1">
        {label}
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}

export default function NoteBubbleMenu({ editor, linkOpen, onLinkOpen, showAi }: { editor: Editor; linkOpen: boolean; onLinkOpen: (open: boolean) => void; showAi: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      strike: current.isActive('strike'),
      code: current.isActive('code'),
      highlight: current.isActive('highlight'),
      link: current.isActive('link'),
      block: blockKey(current),
    }),
  });
  const mod = modKey();
  const blocks = [
    { key: 'text', run: () => editor.chain().focus().setParagraph().run() },
    { key: 'h1', run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { key: 'h2', run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { key: 'h3', run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { key: 'bullet', run: () => editor.chain().focus().toggleBulletList().run() },
    { key: 'ordered', run: () => editor.chain().focus().toggleOrderedList().run() },
    { key: 'task', run: () => editor.chain().focus().toggleTaskList().run() },
    { key: 'quote', run: () => editor.chain().focus().toggleBlockquote().run() },
    { key: 'callout', run: () => editor.chain().focus().insertContent({ type: 'callout', attrs: { type: 'note', title: '', collapsed: false }, content: [{ type: 'paragraph' }] }).run() },
  ].filter((item) => item.key !== 'callout' || Boolean(editor.schema.nodes.callout));
  const blockLabel = state.block === 'callout' ? t('notes.slash_item_callout') : t(`notes.slash_item_${state.block}`);
  return (
    <TooltipProvider delay={400}>
      <BubbleMenu
        editor={editor}
        pluginKey="noteTextMenu"
        updateDelay={40}
        options={{ placement: 'top', offset: 8 }}
        shouldShow={({ editor: current, from, to }) => from !== to && !current.isActive('codeBlock') && !current.isActive('image') && !current.isActive('youtube')}
        className="note-bubble"
      >
        <div className="flex items-center gap-0.5 rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10" role="toolbar" aria-label={t('notes.bubble_aria_format')}>
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" className="max-w-28" />}>{blockLabel}</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                {blocks.map((item) => (
                  <DropdownMenuItem key={item.key} onClick={item.run}>{item.key === 'callout' ? t('notes.slash_item_callout') : t(`notes.slash_item_${item.key}`)}</DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <FormatButton label={t('notes.editor_bold')} shortcut={`${mod}B`} pressed={state.bold} icon={TextBoldIcon} onClick={() => editor.chain().focus().toggleBold().run()} />
          <FormatButton label={t('notes.editor_italic')} shortcut={`${mod}I`} pressed={state.italic} icon={TextItalicIcon} onClick={() => editor.chain().focus().toggleItalic().run()} />
          <FormatButton label={t('notes.editor_strike')} shortcut={`${mod}⇧S`} pressed={state.strike} icon={TextStrikethroughIcon} onClick={() => editor.chain().focus().toggleStrike().run()} />
          <FormatButton label={t('notes.editor_code')} shortcut={`${mod}E`} pressed={state.code} icon={CodeIcon} onClick={() => editor.chain().focus().toggleCode().run()} />
          <FormatButton label={t('notes.editor_highlight')} shortcut={`${mod}⇧H`} pressed={state.highlight} icon={HighlighterIcon} onClick={() => editor.chain().focus().toggleHighlight().run()} />
          <FormatButton label={t('notes.editor_link')} shortcut={`${mod}K`} pressed={state.link} icon={Link01Icon} onClick={() => onLinkOpen(true)} />
          {showAi ? <NoteAiActions editor={editor} compact /> : null}
        </div>
      </BubbleMenu>
      <NoteLinkPopover editor={editor} open={linkOpen} onOpenChange={onLinkOpen} />
    </TooltipProvider>
  );
}
