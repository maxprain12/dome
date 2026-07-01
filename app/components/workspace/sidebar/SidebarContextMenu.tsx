/** Sidebar resource/folder context menu — shared items with folder tab view. */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Resource } from '@/lib/hooks/useResources';
import { FOLDER_COLOR_DEFAULT } from '@/lib/ui/palettes';
import ColorPickerPopover from '@/components/shell/folder-tab/ColorPickerPopover';
import ResourceContextMenuItems from '@/components/shell/folder-tab/ResourceContextMenuItems';
import { parseMeta, type CtxState } from './sidebarHelpers';
import '@/styles/folder-view.css';

export interface ContextMenuProps {
  state: CtxState;
  onClose: () => void;
  onRename: (r: Resource) => void;
  onMove: (r: Resource) => void;
  onMoveToProject: (r: Resource) => void;
  onColorChange: (r: Resource, color: string) => void;
  onDelete: (r: Resource) => void;
  onNewFolder: (parentId: string | null) => void;
  onOpenInSplit?: (r: Resource) => void;
  onOpenInWindow?: (r: Resource) => void;
  /** True when the active tab can host a split view. */
  canOpenInSplit?: boolean;
}

export default function ContextMenu({
  state,
  onClose,
  onRename,
  onMove,
  onMoveToProject,
  onColorChange,
  onDelete,
  onNewFolder,
  onOpenInSplit,
  onOpenInWindow,
  canOpenInSplit,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const resourceRef = useRef<Resource | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; left: number } | null>(null);

  if (state.visible && state.resource) {
    resourceRef.current = state.resource;
  }

  useEffect(() => {
    if (state.visible) setColorPickerPos(null);
  }, [state.visible]);

  useEffect(() => {
    if (!state.visible) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [state.visible, onClose]);

  useEffect(() => {
    if (!colorPickerPos) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setColorPickerPos(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [colorPickerPos]);

  const r = state.resource ?? resourceRef.current;
  if (!r && !colorPickerPos) return null;
  if (!r) return null;

  const isFolder = r.type === 'folder';
  const currentColor = parseMeta(r).color as string | undefined;

  const openColorPicker = () => {
    const popoverWidth = 220;
    const left = Math.min(Math.max(8, state.x), window.innerWidth - popoverWidth - 8);
    const top = Math.min(state.y + 4, window.innerHeight - 120);
    setColorPickerPos({ top, left });
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {state.visible && !colorPickerPos ? (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          className="dome-folder-view__row-menu"
          style={{ top: state.y, right: window.innerWidth - state.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <ResourceContextMenuItems
            options={{
              isFolder,
              isNote: r.type === 'note',
              canOpenInSplit,
            }}
            actions={{
              onRename: () => onRename(r),
              onOpenInSplit: onOpenInSplit ? () => onOpenInSplit(r) : undefined,
              onOpenInWindow: onOpenInWindow ? () => onOpenInWindow(r) : undefined,
              onChangeColor: isFolder ? openColorPicker : undefined,
              onMoveToFolder: () => onMove(r),
              onMoveToProject: () => onMoveToProject(r),
              onNewSubfolder: isFolder ? () => onNewFolder(r.id) : undefined,
              onDelete: () => onDelete(r),
            }}
            onDismiss={onClose}
          />
        </div>
      ) : null}

      {colorPickerPos ? (
        <ColorPickerPopover
          pos={colorPickerPos}
          currentColor={currentColor?.startsWith('#') ? currentColor : FOLDER_COLOR_DEFAULT}
          onSave={(color) => onColorChange(r, color)}
          onClose={() => setColorPickerPos(null)}
        />
      ) : null}
    </>,
    document.body,
  );
}
