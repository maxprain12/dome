import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, Plus } from 'lucide-react';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';

interface BlockHandlesProps {
  editor: Editor;
  enabled?: boolean;
}

interface HoverState {
  blockPos: number;
  rect: DOMRect;
}

const HANDLE_OFFSET = 44;
const HOVER_LEAVE_DELAY = 120;

export default function BlockHandles({ editor, enabled = true }: BlockHandlesProps) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRefs = useRef<{ root: HTMLDivElement | null }>({ root: null });

  useEffect(() => {
    if (!enabled) {
      setHover(null);
      return;
    }
    const dom = editor.view.dom as HTMLElement;
    if (!dom) return;

    const cancelLeave = () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
    };

    const onMove = (event: MouseEvent) => {
      cancelLeave();
      const target = event.target as HTMLElement | null;
      if (!target) return;
      // Find the top-level block element directly under doc root.
      const editorRoot = dom;
      let node: HTMLElement | null = target;
      while (node && node.parentElement && node.parentElement !== editorRoot) {
        node = node.parentElement;
      }
      if (!node || node === editorRoot || !editorRoot.contains(node)) {
        scheduleLeave();
        return;
      }
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        scheduleLeave();
        return;
      }
      let blockPos: number | null = null;
      try {
        const innerPos = editor.view.posAtDOM(node, 0);
        const $pos = editor.state.doc.resolve(Math.max(0, innerPos));
        blockPos = $pos.depth >= 1 ? $pos.before(1) : Math.max(0, innerPos - 1);
      } catch {
        blockPos = null;
      }
      if (blockPos == null || blockPos < 0) {
        scheduleLeave();
        return;
      }
      setHover({ blockPos, rect });
    };

    const scheduleLeave = () => {
      cancelLeave();
      leaveTimerRef.current = setTimeout(() => setHover(null), HOVER_LEAVE_DELAY);
    };

    const onLeave = (event: MouseEvent) => {
      const related = event.relatedTarget as HTMLElement | null;
      if (related && handleRefs.current.root?.contains(related)) return;
      scheduleLeave();
    };

    dom.addEventListener('mousemove', onMove);
    dom.addEventListener('mouseleave', onLeave);
    return () => {
      cancelLeave();
      dom.removeEventListener('mousemove', onMove);
      dom.removeEventListener('mouseleave', onLeave);
    };
  }, [editor, enabled]);

  // Also reposition on scroll inside the editor's scroll parent.
  useEffect(() => {
    if (!enabled || !hover) return;
    const update = () => {
      const dom = editor.view.dom as HTMLElement | null;
      if (!dom) return;
      let blockEl: HTMLElement | null = null;
      try {
        const found = editor.view.domAtPos(hover.blockPos);
        const candidate = (found?.node as HTMLElement | null) ?? null;
        blockEl = candidate?.nodeType === 1 ? candidate : (candidate?.parentElement ?? null);
      } catch {
        blockEl = null;
      }
      if (!blockEl) return;
      const rect = blockEl.getBoundingClientRect();
      if (rect.width && rect.height) setHover((h) => (h ? { ...h, rect } : h));
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [editor, hover, enabled]);

  if (!enabled || !hover) return null;

  const { rect, blockPos } = hover;
  const top = rect.top + Math.max(0, (rect.height - 24) / 2);
  const left = rect.left - HANDLE_OFFSET;

  const handlePlus = () => {
    const node = editor.state.doc.nodeAt(blockPos);
    if (!node) return;
    const insertPos = blockPos + node.nodeSize;
    editor
      .chain()
      .focus()
      .insertContentAt(insertPos, { type: 'paragraph' })
      .setTextSelection(insertPos + 1)
      .insertContent('/')
      .run();
  };

  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>) => {
    const node = editor.state.doc.nodeAt(blockPos);
    if (!node) return;
    try {
      const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, blockPos));
      editor.view.dispatch(tr);
    } catch {
      return;
    }
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      // ProseMirror reads the active NodeSelection on drop; an HTML payload
      // keeps the OS drag indicator happy in browsers that demand one.
      event.dataTransfer.setData('text/html', node.textContent || ' ');
    }
  };

  return createPortal(
    <div
      ref={(el) => {
        handleRefs.current.root = el;
      }}
      className="dome-block-handles"
      style={{ position: 'fixed', top, left, zIndex: 30 }}
      onMouseEnter={() => {
        if (leaveTimerRef.current) {
          clearTimeout(leaveTimerRef.current);
          leaveTimerRef.current = null;
        }
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="dome-block-handle dome-block-plus"
        title="Añadir bloque"
        aria-label="Añadir bloque"
        onClick={handlePlus}
      >
        <Plus size={14} strokeWidth={2.2} />
      </button>
      <button
        type="button"
        className="dome-block-handle dome-block-drag"
        title="Arrastrar para mover"
        aria-label="Arrastrar para mover"
        draggable
        onDragStart={handleDragStart}
      >
        <GripVertical size={14} strokeWidth={2.2} />
      </button>
    </div>,
    document.body,
  );
}
