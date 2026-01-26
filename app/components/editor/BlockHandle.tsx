'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Editor } from '@tiptap/core';
import { GripVertical } from 'lucide-react';

interface BlockHandleProps {
  editor: Editor;
  element: HTMLElement;
}

export function BlockHandle({ editor, element }: BlockHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStartY = useRef<number>(0);
  const originalPos = useRef<number | null>(null);

  useEffect(() => {
    const handle = element.querySelector('.block-handle') as HTMLElement;
    if (!handle) return;

    const onMouseEnter = () => setIsHovered(true);
    const onMouseLeave = () => {
      if (!isDragging) setIsHovered(false);
    };

    handle.addEventListener('mouseenter', onMouseEnter);
    handle.addEventListener('mouseleave', onMouseLeave);

    return () => {
      handle.removeEventListener('mouseenter', onMouseEnter);
      handle.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [element, isDragging]);

  const getNodePosition = useCallback(() => {
    const { state } = editor;
    const { doc } = state;
    let nodePos: number | null = null;

    // Find the position of this element's corresponding node
    doc.descendants((node, pos) => {
      if (nodePos !== null) return false;
      
      const domNode = editor.view.nodeDOM(pos);
      if (domNode === element || (domNode && element.contains(domNode as Node))) {
        nodePos = pos;
        return false;
      }
      return true;
    });

    return nodePos;
  }, [editor, element]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(true);
    dragStartY.current = e.clientY;
    originalPos.current = getNodePosition();

    // Add visual feedback
    element.style.opacity = '0.5';
    element.style.transition = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (originalPos.current === null) return;

      const deltaY = moveEvent.clientY - dragStartY.current;
      element.style.transform = `translateY(${deltaY}px)`;
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      setIsDragging(false);
      setIsHovered(false);
      
      // Reset visual styles
      element.style.opacity = '1';
      element.style.transform = '';
      element.style.transition = '';

      if (originalPos.current !== null) {
        // Calculate target position based on where we dropped
        const { state } = editor;
        const { doc } = state;
        const targetY = upEvent.clientY;

        let targetPos: number | null = null;
        let insertBefore = true;

        // Find the nearest node position to drop
        doc.descendants((node, pos) => {
          if (!node.isBlock) return true;
          
          const domNode = editor.view.nodeDOM(pos) as HTMLElement;
          if (domNode) {
            const rect = domNode.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            
            if (targetY < midY && (targetPos === null || pos < targetPos)) {
              targetPos = pos;
              insertBefore = true;
            } else if (targetY >= midY) {
              targetPos = pos + node.nodeSize;
              insertBefore = false;
            }
          }
          return true;
        });

        // Only move if position actually changed
        if (targetPos !== null && targetPos !== originalPos.current) {
          const validTargetPos = targetPos;
          const nodeToMove = doc.nodeAt(originalPos.current);
          if (nodeToMove) {
            const { tr } = state;
            const nodeSize = nodeToMove.nodeSize;

            // Adjust target position if moving down
            let adjustedTarget: number = validTargetPos;
            if (validTargetPos > originalPos.current) {
              adjustedTarget = validTargetPos - nodeSize;
            }

            // Delete from original position and insert at new position
            tr.delete(originalPos.current, originalPos.current + nodeSize);
            tr.insert(adjustedTarget, nodeToMove);
            
            editor.view.dispatch(tr);
          }
        }
      }

      originalPos.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [editor, element, getNodePosition]);

  return (
    <div
      className="block-handle"
      draggable={false}
      style={{
        position: 'absolute',
        left: '-24px',
        top: '4px',
        display: isHovered || isDragging ? 'flex' : 'none',
        alignItems: 'center',
        justifyContent: 'center',
        width: '20px',
        height: '20px',
        cursor: isDragging ? 'grabbing' : 'grab',
        color: 'var(--secondary)',
        transition: 'opacity 0.2s, color 0.2s',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: isDragging ? 'var(--bg-hover)' : 'transparent',
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => !isDragging && setIsHovered(false)}
      aria-label="Arrastrar para reordenar bloque"
      role="button"
      tabIndex={0}
    >
      <GripVertical size={14} />
    </div>
  );
}
