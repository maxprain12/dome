import type { Editor } from '@tiptap/core';
import { useTranslation } from 'react-i18next';
import { AtSign, LayoutList, Plus, Sparkles, TextQuote } from 'lucide-react';
import { MarkButton } from '@/components/tiptap-ui/mark-button';

interface NoteFloatingInsertMenuProps {
  editor: Editor | null;
  zenMode?: boolean;
  /** Insert Dome AI atom block inline. */
  onInsertAiBlock?: () => void;
  onRequestLinkPopover?: () => void;
}

function modKey(): string {
  if (typeof navigator === 'undefined') return '⌘';
  return /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl+';
}

export function NoteFloatingInsertMenu({
  editor,
  onInsertAiBlock,
  onRequestLinkPopover,
}: NoteFloatingInsertMenuProps) {
  const { t } = useTranslation();

  if (!editor || !editor.isEditable) return null;

  return (
    <div className="note-insert-dock">
      <div className="note-insert-bar-inner" role="toolbar" aria-label={t('notes.insert_bar_aria')}>
        <button
          type="button"
          className="note-insert-plus-btn"
          title={t('notes.bubble_insert_block')}
          aria-label={t('notes.bubble_insert_block')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().insertContent('/').run()}
        >
          <Plus size={16} strokeWidth={2} />
        </button>

        <span className="note-insert-bar-sep" aria-hidden />

        <MarkButton editor={editor} type="bold" showTooltip={false} />
        <MarkButton editor={editor} type="italic" showTooltip={false} />
        <button
          type="button"
          title={t('notes.insert_list')}
          aria-label={t('notes.insert_list')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <LayoutList size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          title={t('notes.bubble_type_quote')}
          aria-label={t('notes.bubble_type_quote')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <TextQuote size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          title={t('notes.bubble_insert_mention')}
          aria-label={t('notes.bubble_insert_mention')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().insertContent('@').run()}
        >
          <AtSign size={16} strokeWidth={2} />
        </button>

        <span className="note-insert-bar-sep" aria-hidden />

        <button
          type="button"
          className="note-insert-kbd-btn"
          title={t('notes.bubble_link')}
          aria-label={t('notes.bubble_link')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onRequestLinkPopover?.()}
        >
          {modKey()}K
        </button>

        {typeof onInsertAiBlock === 'function' ? (
          <>
            <span className="note-insert-bar-sep" aria-hidden />
            <button
              type="button"
              className="note-ai-insert-trigger"
              title={t('focused_editor.ai_block')}
              aria-label={t('focused_editor.ai_block')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsertAiBlock()}
            >
              <Sparkles size={15} strokeWidth={2} />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
