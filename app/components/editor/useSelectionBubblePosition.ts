import { useLayoutEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { posToDOMRect } from '@tiptap/core';

const MENU_HEIGHT = 40;
const GAP = 10;

export type SelectionBubblePlacement = 'top' | 'bottom';

export function useSelectionBubblePosition(editor: Editor, visible: boolean) {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    placement: SelectionBubblePlacement;
  } | null>(null);

  useLayoutEffect(() => {
    if (!visible || editor.isDestroyed) {
      setPosition(null);
      return;
    }

    const update = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        setPosition(null);
        return;
      }

      const rect = posToDOMRect(editor.view, from, to);
      const centerX = rect.left + rect.width / 2;
      let top = rect.top - MENU_HEIGHT - GAP;
      let placement: SelectionBubblePlacement = 'top';
      if (top < 12) {
        top = rect.bottom + GAP;
        placement = 'bottom';
      }

      const left = Math.min(Math.max(16, centerX), window.innerWidth - 16);

      setPosition({ top, left, placement });
    };

    update();
    const raf = requestAnimationFrame(() => update());

    const scrollRoot = editor.view.dom.closest('.note-editor-content');
    const onScrollOrResize = () => update();
    scrollRoot?.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    const onSelectionUpdate = () => update();
    editor.on('selectionUpdate', onSelectionUpdate);
    editor.on('transaction', onSelectionUpdate);

    return () => {
      cancelAnimationFrame(raf);
      scrollRoot?.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      editor.off('selectionUpdate', onSelectionUpdate);
      editor.off('transaction', onSelectionUpdate);
    };
  }, [visible, editor]);

  return position;
}
