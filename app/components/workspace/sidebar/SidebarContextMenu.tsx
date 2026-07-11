/** Sidebar resource/folder context menu — shared items with folder tab view. */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Resource } from '@/lib/hooks/useResources';
import { FOLDER_COLOR_DEFAULT } from '@/lib/ui/palettes';
import ColorPickerPopover from '@/components/shell/folder-tab/ColorPickerPopover';
import ResourceContextMenuItems, {
  type ResourceContextMenuActions,
  type ResourceContextMenuOptions,
} from '@/components/shell/folder-tab/ResourceContextMenuItems';
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

type ResourceAction = (r: Resource) => void;
type OptionalResourceAction = ((r: Resource) => void) | undefined;

interface MenuHandlers {
  onRename: ResourceAction;
  onMove: ResourceAction;
  onMoveToProject: ResourceAction;
  onDelete: ResourceAction;
  onNewFolder: (parentId: string | null) => void;
}

// --- Helpers (top-level so their complexity is computed independently) -------

function useDismissOnOutsideAndEscape(
  ref: React.RefObject<HTMLElement>,
  enabled: boolean,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!enabled) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [enabled, onDismiss, ref]);
}

function useEscapeKey(enabled: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, onEscape]);
}

function computeColorPickerPos(x: number, y: number): { top: number; left: number } {
  const popoverWidth = 220;
  const left = Math.min(Math.max(8, x), window.innerWidth - popoverWidth - 8);
  const top = Math.min(y + 4, window.innerHeight - 120);
  return { top, left };
}

function resolveCurrentColor(color: string | undefined): string {
  if (color && color.startsWith('#')) return color;
  return FOLDER_COLOR_DEFAULT;
}

function buildMenuOptions(
  r: Resource,
  isFolder: boolean,
  canOpenInSplit: boolean | undefined,
): ResourceContextMenuOptions {
  return {
    isFolder,
    isNote: r.type === 'note',
    canOpenInSplit,
  };
}

function buildMenuActions(
  r: Resource,
  isFolder: boolean,
  handlers: MenuHandlers,
  onOpenInSplit: OptionalResourceAction,
  onOpenInWindow: OptionalResourceAction,
  openColorPicker: () => void,
): ResourceContextMenuActions {
  const actions: ResourceContextMenuActions = {
    onRename: () => handlers.onRename(r),
    onMoveToFolder: () => handlers.onMove(r),
    onMoveToProject: () => handlers.onMoveToProject(r),
    onDelete: () => handlers.onDelete(r),
  };
  if (onOpenInSplit) actions.onOpenInSplit = () => onOpenInSplit(r);
  if (onOpenInWindow) actions.onOpenInWindow = () => onOpenInWindow(r);
  if (isFolder) {
    actions.onChangeColor = openColorPicker;
    actions.onNewSubfolder = () => handlers.onNewFolder(r.id);
  }
  return actions;
}

// --- Sub-components (extracted to remove JSX/ternary nesting depth) ---------

interface MenuPanelProps {
  r: Resource;
  state: CtxState;
  isFolder: boolean;
  canOpenInSplit: boolean | undefined;
  menuRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  handlers: MenuHandlers;
  onOpenInSplit: OptionalResourceAction;
  onOpenInWindow: OptionalResourceAction;
  openColorPicker: () => void;
}

function MenuPanel({
  r,
  state,
  isFolder,
  canOpenInSplit,
  menuRef,
  onClose,
  handlers,
  onOpenInSplit,
  onOpenInWindow,
  openColorPicker,
}: MenuPanelProps) {
  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      className="dome-folder-view__row-menu"
      style={{ top: state.y, right: window.innerWidth - state.x }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <ResourceContextMenuItems
        resource={r}
        options={buildMenuOptions(r, isFolder, canOpenInSplit)}
        actions={buildMenuActions(r, isFolder, handlers, onOpenInSplit, onOpenInWindow, openColorPicker)}
        onDismiss={onClose}
      />
    </div>
  );
}

interface ColorPickerPanelProps {
  currentColor: string | undefined;
  pos: { top: number; left: number };
  onColorChange: (color: string) => void;
  onClose: () => void;
}

function ColorPickerPanel({ currentColor, pos, onColorChange, onClose }: ColorPickerPanelProps) {
  return (
    <ColorPickerPopover
      pos={pos}
      currentColor={resolveCurrentColor(currentColor)}
      onSave={onColorChange}
      onClose={onClose}
    />
  );
}

// --- Main component ---------------------------------------------------------

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

  // Capture the active resource so we can keep rendering if state.resource
  // briefly becomes null between updates (e.g. when closing the menu).
  if (state.visible && state.resource) {
    resourceRef.current = state.resource;
  }

  useEffect(() => {
    if (state.visible) setColorPickerPos(null);
  }, [state.visible]);

  useDismissOnOutsideAndEscape(menuRef, state.visible, onClose);
  useEscapeKey(colorPickerPos !== null, () => setColorPickerPos(null));

  const r = state.resource ?? resourceRef.current;
  if (!r) return null;
  if (typeof document === 'undefined') return null;

  const isFolder = r.type === 'folder';
  const currentColor = parseMeta(r).color as string | undefined;
  const openColorPicker = () => setColorPickerPos(computeColorPickerPos(state.x, state.y));
  const handlers: MenuHandlers = { onRename, onMove, onMoveToProject, onDelete, onNewFolder };
  const showMenu = state.visible && !colorPickerPos;

  return createPortal(
    <>
      {showMenu ? (
        <MenuPanel
          r={r}
          state={state}
          isFolder={isFolder}
          canOpenInSplit={canOpenInSplit}
          menuRef={menuRef}
          onClose={onClose}
          handlers={handlers}
          onOpenInSplit={onOpenInSplit}
          onOpenInWindow={onOpenInWindow}
          openColorPicker={openColorPicker}
        />
      ) : null}
      {colorPickerPos ? (
        <ColorPickerPanel
          currentColor={currentColor}
          pos={colorPickerPos}
          onColorChange={(color) => onColorChange(r, color)}
          onClose={() => setColorPickerPos(null)}
        />
      ) : null}
    </>,
    document.body,
  );
}
