/** Sidebar resource/folder context menu — shared items with folder tab view. */

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import type { Resource } from '@/lib/hooks/useResources';
import { FOLDER_COLOR_DEFAULT } from '@/lib/ui/palettes';
import ColorPickerPopover from '@/components/shell/folder-tab/ColorPickerPopover';
import ResourceContextMenuItems, {
  type ResourceContextMenuActions,
} from '@/components/shell/folder-tab/ResourceContextMenuItems';
import { parseMeta, type CtxState } from './sidebarHelpers';
import '@/styles/folder-view.css';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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

/** Clamp color-picker popover to the viewport (same math as before). */
export function clampColorPickerPos(x: number, y: number): { top: number; left: number } {
  const popoverWidth = 220;
  const left = Math.min(Math.max(8, x), window.innerWidth - popoverWidth - 8);
  const top = Math.min(y + 4, window.innerHeight - 120);
  return { top, left };
}

/** Hex folder color for the picker, else default swatch. */
export function resolveFolderPickerColor(currentColor: string | undefined): string {
  if (currentColor?.startsWith('#')) return currentColor;
  return FOLDER_COLOR_DEFAULT;
}

type MenuActionHandlers = {
  onRename: (r: Resource) => void;
  onMove: (r: Resource) => void;
  onMoveToProject: (r: Resource) => void;
  onDelete: (r: Resource) => void;
  onNewFolder: (parentId: string | null) => void;
  onOpenInSplit?: (r: Resource) => void;
  onOpenInWindow?: (r: Resource) => void;
};

/** Wire resource callbacks into ResourceContextMenuItems actions (extracted for S3776). */
export function buildSidebarMenuActions(
  r: Resource,
  isFolder: boolean,
  handlers: MenuActionHandlers,
  openColorPicker: () => void,
): ResourceContextMenuActions {
  const { onRename, onMove, onMoveToProject, onDelete, onNewFolder, onOpenInSplit, onOpenInWindow } =
    handlers;
  return {
    onRename: () => onRename(r),
    onOpenInSplit: onOpenInSplit ? () => onOpenInSplit(r) : undefined,
    onOpenInWindow: onOpenInWindow ? () => onOpenInWindow(r) : undefined,
    onChangeColor: isFolder ? openColorPicker : undefined,
    onMoveToFolder: () => onMove(r),
    onMoveToProject: () => onMoveToProject(r),
    onNewSubfolder: isFolder ? () => onNewFolder(r.id) : undefined,
    onDelete: () => onDelete(r),
  };
}

function useStickyMenuResource(state: CtxState): Resource | null {
  const resourceRef = useRef<Resource | null>(null);
  if (state.visible && state.resource) {
    resourceRef.current = state.resource;
  }
  return state.resource ?? resourceRef.current;
}

function useColorPickerPos(
  menuVisible: boolean,
): [
  { top: number; left: number } | null,
  Dispatch<SetStateAction<{ top: number; left: number } | null>>,
] {
  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (menuVisible) setColorPickerPos(null);
  }, [menuVisible]);

  useEffect(() => {
    if (!colorPickerPos) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setColorPickerPos(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [colorPickerPos]);

  return [colorPickerPos, setColorPickerPos];
}

function SidebarMenuDropdown({
  state,
  resource,
  isFolder,
  canOpenInSplit,
  openColorPicker,
  onClose,
  handlers,
}: {
  state: CtxState;
  resource: Resource;
  isFolder: boolean;
  canOpenInSplit?: boolean;
  openColorPicker: () => void;
  onClose: () => void;
  handlers: MenuActionHandlers;
}) {
  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuTrigger
        nativeButton={false}
        render={
          <span
            className="pointer-events-none fixed size-px"
            style={{ top: state.y, left: state.x }}
            aria-hidden
          />
        }
      />
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={0}
        positionMethod="fixed"
        className="dome-folder-view__row-menu w-auto p-1.5"
      >
        <ResourceContextMenuItems
          resource={resource}
          options={{
            isFolder,
            isNote: resource.type === 'note',
            canOpenInSplit,
          }}
          actions={buildSidebarMenuActions(resource, isFolder, handlers, openColorPicker)}
          onDismiss={onClose}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
  const resource = useStickyMenuResource(state);
  const [colorPickerPos, setColorPickerPos] = useColorPickerPos(state.visible);

  if (!resource && !colorPickerPos) return null;
  if (!resource) return null;
  if (typeof document === 'undefined') return null;

  const isFolder = resource.type === 'folder';
  const currentColor = parseMeta(resource).color as string | undefined;
  const openColorPicker = () => {
    setColorPickerPos(clampColorPickerPos(state.x, state.y));
  };
  const handlers: MenuActionHandlers = {
    onRename,
    onMove,
    onMoveToProject,
    onDelete,
    onNewFolder,
    onOpenInSplit,
    onOpenInWindow,
  };

  return createPortal(
    <>
      {state.visible && !colorPickerPos ? (
        <SidebarMenuDropdown
          state={state}
          resource={resource}
          isFolder={isFolder}
          canOpenInSplit={canOpenInSplit}
          openColorPicker={openColorPicker}
          onClose={onClose}
          handlers={handlers}
        />
      ) : null}

      {colorPickerPos ? (
        <ColorPickerPopover
          pos={colorPickerPos}
          currentColor={resolveFolderPickerColor(currentColor)}
          onSave={(color) => onColorChange(resource, color)}
          onClose={() => setColorPickerPos(null)}
        />
      ) : null}
    </>,
    document.body,
  );
}
