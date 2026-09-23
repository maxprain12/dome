import { useEditorState, type Editor } from '@tiptap/react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';

export default function NoteEditorToolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const linkId = useId();
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
  const validLink = /^(https?:\/\/|mailto:|dome:\/\/)[^\s]+$/i.test(href.trim());
  const applyLink = () => {
    if (!validLink) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    if (editor.state.selection.empty && !editor.isActive('link')) chain.insertContent({ type: 'text', text: href.trim(), marks: [{ type: 'link', attrs: { href: href.trim() } }] }).run();
    else chain.setLink({ href: href.trim() }).run();
    setLinkOpen(false);
  };
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      undo: current.can().undo(),
      redo: current.can().redo(),
      link: current.isActive('link'),
      table: current.isActive('table'),
    }),
  });
  const blocks = [
    { key: 'text', run: () => editor.chain().focus().setParagraph().run() },
    ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({ key: `h${level}`, run: () => editor.chain().focus().toggleHeading({ level }).run() })),
    { key: 'bullet', run: () => editor.chain().focus().toggleBulletList().run() },
    { key: 'ordered', run: () => editor.chain().focus().toggleOrderedList().run() },
    { key: 'task', run: () => editor.chain().focus().toggleTaskList().run() },
    { key: 'quote', run: () => editor.chain().focus().toggleBlockquote().run() },
    { key: 'code', run: () => editor.chain().focus().toggleCodeBlock().run() },
    { key: 'divider', run: () => editor.chain().focus().setHorizontalRule().run() },
    { key: 'table', run: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  ];
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1" aria-label={t('notes.editor_formatting')}>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>{t('notes.editor_blocks')}</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            {blocks.map(({ key, run }) => <DropdownMenuItem key={key} onClick={run}>{t(`notes.slash_item_${key}`)}</DropdownMenuItem>)}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button type="button" variant="ghost" size="sm" aria-pressed={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>{t('notes.editor_bold')}</Button>
      <Button type="button" variant="ghost" size="sm" aria-pressed={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>{t('notes.editor_italic')}</Button>
      <Popover open={linkOpen} onOpenChange={(open) => { if (open) setHref(String(editor.getAttributes('link').href || '')); setLinkOpen(open); }}>
        <PopoverTrigger render={<Button type="button" variant="ghost" size="sm" aria-pressed={state.link} />}>{t('notes.editor_link')}</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>{t('notes.editor_link')}</PopoverTitle>
          <Field>
            <FieldLabel htmlFor={linkId}>{t('notes.editor_link_url')}</FieldLabel>
            <Input id={linkId} value={href} onChange={(event) => setHref(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyLink(); } }} />
          </Field>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={!validLink} onClick={applyLink}>{t('common.save')}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={!state.link} onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setLinkOpen(false); }}>{t('common.delete')}</Button>
          </div>
        </PopoverContent>
      </Popover>
      {state.table ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>{t('notes.slash_item_table')}</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>{t('notes.editor_add_row')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>{t('notes.editor_add_column')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().deleteRow().run()}>{t('notes.editor_delete_row')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().deleteColumn().run()}>{t('notes.editor_delete_column')}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => editor.chain().focus().deleteTable().run()}>{t('notes.editor_delete_table')}</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Button type="button" variant="ghost" size="sm" disabled={!state.undo} onClick={() => editor.chain().focus().undo().run()}>{t('notes.editor_undo')}</Button>
      <Button type="button" variant="ghost" size="sm" disabled={!state.redo} onClick={() => editor.chain().focus().redo().run()}>{t('notes.editor_redo')}</Button>
    </div>
  );
}
