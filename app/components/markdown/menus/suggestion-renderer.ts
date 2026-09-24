import type { Editor, Range } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import type { SuggestionKeyDownProps } from '@tiptap/suggestion';
import SuggestionList, { type SuggestionListHandle } from './SuggestionList';

export interface SlashMenuProps<T> {
  editor: Editor;
  range: Range;
  query: string;
  items: T[];
  command: (item: T) => void;
  clientRect?: (() => DOMRect | null) | null;
}

interface CaretBox {
  left: number;
  bottom: number;
}

function caretBox(editor: Editor, range: Range, clientRect?: (() => DOMRect | null) | null): CaretBox | null {
  try {
    const coords = editor.view.coordsAtPos(Math.max(1, range.to));
    if (coords.bottom > 0 || coords.left > 0) return { left: coords.left, bottom: coords.bottom };
  } catch {
    /* The view can reject the position while a transaction is still applying. */
  }
  const rect = clientRect?.();
  if (!rect) return null;
  return { left: rect.left, bottom: rect.bottom };
}

/** Pins the suggestion list to the caret. `position: fixed` stays visible above the clipped note column. */
export function renderSuggestion<T>() {
  return () => {
    let renderer: ReactRenderer<SuggestionListHandle> | null = null;
    let element: HTMLElement | null = null;
    let latest: SlashMenuProps<T> | null = null;
    let exitFrame = 0;

    const place = () => {
      if (!element || !latest) return;
      const box = caretBox(latest.editor, latest.range, latest.clientRect);
      if (!box) return;
      const margin = 8;
      const width = element.offsetWidth || 288;
      const spaceBelow = window.innerHeight - box.bottom - margin;
      const spaceAbove = Math.max(0, box.bottom - margin);
      const maxHeight = Math.max(120, Math.min(320, Math.max(spaceBelow, spaceAbove) - 6));
      element.style.maxHeight = `${maxHeight}px`;
      element.style.overflow = 'auto';
      const left = Math.min(Math.max(margin, box.left), Math.max(margin, window.innerWidth - width - margin));
      const top = spaceBelow >= 160 || spaceBelow >= spaceAbove
        ? box.bottom + 6
        : Math.max(margin, box.bottom - maxHeight - 6);
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
    };

    const stop = () => {
      document.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      element?.remove();
      renderer?.destroy();
      renderer = null;
      element = null;
      latest = null;
    };

    const open = (props: SlashMenuProps<T>) => {
      if (exitFrame) {
        cancelAnimationFrame(exitFrame);
        exitFrame = 0;
      }
      latest = props;
      if (!renderer || !element?.isConnected) {
        renderer?.destroy();
        renderer = new ReactRenderer(SuggestionList, { editor: props.editor, props });
        element = renderer.element;
        element.classList.add('slash-command-menu');
        element.style.position = 'fixed';
        element.style.zIndex = '10001';
        document.body.appendChild(element);
        document.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
      } else {
        renderer.updateProps(props);
      }
      place();
    };

    return {
      onStart: open,
      onUpdate: open,
      onKeyDown: (props: SuggestionKeyDownProps) => {
        if (props.event.key === 'Escape') return true;
        return renderer?.ref?.onKeyDown(props.event) ?? false;
      },
      onExit: () => {
        if (exitFrame) cancelAnimationFrame(exitFrame);
        exitFrame = requestAnimationFrame(() => {
          exitFrame = 0;
          stop();
        });
      },
    };
  };
}
