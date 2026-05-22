import type { Editor } from '@tiptap/core';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import { GripVertical, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';

interface NoteDragHandleProps {
  editor: Editor | null;
  editable?: boolean;
}

export function NoteDragHandle({ editor, editable }: NoteDragHandleProps) {
  const { t } = useTranslation();
  const dispatchSlash = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertContent('/').run();
  }, [editor]);

  const setDragging = useCallback(
    (dragging: boolean) => {
      const root = editor?.view.dom.closest('.note-editor-wrapper');
      root?.classList.toggle('is-dragging-block', dragging);
    },
    [editor],
  );

  if (!editor || !editable) return null;

  return (
    <DragHandle
      editor={editor}
      nested
      computePositionConfig={{ placement: 'left-start', strategy: 'fixed' }}
      className="note-editor-drag-host"
      onElementDragStart={() => setDragging(true)}
      onElementDragEnd={() => setDragging(false)}
    >
      <div className="drag-handle-trigger inline-flex items-center gap-0.5">
        <button
          type="button"
          title={t('notes.drag_add_block')}
          aria-label={t('notes.drag_add_block')}
          className="note-drag-mini"
          style={{ background: 'var(--dome-accent-bg)', color: 'var(--dome-accent)' }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={dispatchSlash}
        >
          <Plus size={13} strokeWidth={2} />
        </button>
        <button
          type="button"
          title={t('notes.drag_more')}
          aria-label={t('notes.drag_more')}
          className="note-drag-mini note-drag-grip"
        >
          <GripVertical size={14} strokeWidth={2} />
        </button>
      </div>
    </DragHandle>
  );
}
