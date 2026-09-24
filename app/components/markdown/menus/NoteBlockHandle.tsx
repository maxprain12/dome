import { useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import type { Node } from '@tiptap/pm/model';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, DragDropVerticalIcon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function NoteBlockHandle({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const posRef = useRef<number | null>(null);

  const remember = (node: Node | null, pos: number) => {
    posRef.current = node ? pos : null;
  };

  const convert = (run: () => void) => {
    const pos = posRef.current;
    if (pos == null) return;
    editor.chain().focus().setTextSelection(pos + 1).run();
    run();
  };

  const insertBelow = () => {
    const pos = posRef.current;
    if (pos == null) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    const at = pos + node.nodeSize;
    editor.chain().focus().insertContentAt(at, { type: 'paragraph', content: [{ type: 'text', text: '/' }] }).run();
  };

  const duplicate = () => {
    const pos = posRef.current;
    if (pos == null) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    editor.chain().focus().insertContentAt(pos + node.nodeSize, node.toJSON()).run();
  };

  const remove = () => {
    const pos = posRef.current;
    if (pos == null) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  };

  return (
    <DragHandle editor={editor} className="note-block-handle" onNodeChange={({ node, pos }) => remember(node, pos)} computePositionConfig={{ placement: 'left-start', strategy: 'absolute' }}>
      <button type="button" className="note-block-btn" aria-label={t('notes.drag_add_block')} onMouseDown={(event) => event.stopPropagation()} onClick={insertBelow}>
        <HugeiconsIcon icon={PlusSignIcon} size={14} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<button type="button" className="note-block-btn" aria-label={t('notes.drag_more')} />}>
          <HugeiconsIcon icon={DragDropVerticalIcon} size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => convert(() => editor.chain().focus().setParagraph().run())}>{t('notes.slash_item_text')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => convert(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}>{t('notes.slash_item_h1')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => convert(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}>{t('notes.slash_item_h2')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => convert(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}>{t('notes.slash_item_h3')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => convert(() => editor.chain().focus().toggleBulletList().run())}>{t('notes.slash_item_bullet')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => convert(() => editor.chain().focus().toggleBlockquote().run())}>{t('notes.slash_item_quote')}</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={duplicate}>{t('notes.editor_duplicate')}</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={remove}>
            <HugeiconsIcon icon={Delete02Icon} size={14} />
            {t('notes.delete_block')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </DragHandle>
  );
}
