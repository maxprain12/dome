import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Resource } from '@/lib/hooks/useResources';
import { FOLDER_COLOR_DEFAULT } from '@/lib/ui/palettes';
import ContextMenu, {
  buildSidebarMenuActions,
  clampColorPickerPos,
  resolveFolderPickerColor,
} from './SidebarContextMenu';

function makeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: 'res-1',
    title: 'Notes',
    type: 'folder',
    project_id: 'proj-1',
    folder_id: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe('clampColorPickerPos', () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
  });

  it('clamps left into the viewport with an 8px margin', () => {
    expect(clampColorPickerPos(-50, 100)).toEqual({ top: 104, left: 8 });
    expect(clampColorPickerPos(900, 100).left).toBe(1000 - 220 - 8);
  });

  it('keeps top within the lower viewport bound', () => {
    expect(clampColorPickerPos(40, 900).top).toBe(800 - 120);
  });
});

describe('resolveFolderPickerColor', () => {
  it('returns hex colors unchanged and falls back otherwise', () => {
    expect(resolveFolderPickerColor('#aabbcc')).toBe('#aabbcc');
    expect(resolveFolderPickerColor('blue')).toBe(FOLDER_COLOR_DEFAULT);
    expect(resolveFolderPickerColor(undefined)).toBe(FOLDER_COLOR_DEFAULT);
  });
});

describe('buildSidebarMenuActions', () => {
  it('wires folder actions and omits optional open handlers when absent', () => {
    const r = makeResource({ type: 'folder' });
    const onRename = vi.fn();
    const onMove = vi.fn();
    const onMoveToProject = vi.fn();
    const onDelete = vi.fn();
    const onNewFolder = vi.fn();
    const openColorPicker = vi.fn();

    const actions = buildSidebarMenuActions(
      r,
      true,
      { onRename, onMove, onMoveToProject, onDelete, onNewFolder },
      openColorPicker,
    );

    expect(actions.onOpenInSplit).toBeUndefined();
    expect(actions.onOpenInWindow).toBeUndefined();
    actions.onRename();
    actions.onMoveToFolder?.();
    actions.onMoveToProject();
    actions.onChangeColor?.();
    actions.onNewSubfolder?.();
    actions.onDelete();

    expect(onRename).toHaveBeenCalledWith(r);
    expect(onMove).toHaveBeenCalledWith(r);
    expect(onMoveToProject).toHaveBeenCalledWith(r);
    expect(openColorPicker).toHaveBeenCalledTimes(1);
    expect(onNewFolder).toHaveBeenCalledWith(r.id);
    expect(onDelete).toHaveBeenCalledWith(r);
  });

  it('skips folder-only actions for non-folders and forwards open handlers', () => {
    const r = makeResource({ type: 'pdf', title: 'Doc' });
    const onOpenInSplit = vi.fn();
    const onOpenInWindow = vi.fn();
    const actions = buildSidebarMenuActions(
      r,
      false,
      {
        onRename: vi.fn(),
        onMove: vi.fn(),
        onMoveToProject: vi.fn(),
        onDelete: vi.fn(),
        onNewFolder: vi.fn(),
        onOpenInSplit,
        onOpenInWindow,
      },
      vi.fn(),
    );

    expect(actions.onChangeColor).toBeUndefined();
    expect(actions.onNewSubfolder).toBeUndefined();
    actions.onOpenInSplit?.();
    actions.onOpenInWindow?.();
    expect(onOpenInSplit).toHaveBeenCalledWith(r);
    expect(onOpenInWindow).toHaveBeenCalledWith(r);
  });
});

describe('ContextMenu', () => {
  it('renders nothing when closed with no resource', () => {
    const { container } = render(
      <ContextMenu
        state={{ visible: false, x: 0, y: 0, resource: null }}
        onClose={vi.fn()}
        onRename={vi.fn()}
        onMove={vi.fn()}
        onMoveToProject={vi.fn()}
        onColorChange={vi.fn()}
        onDelete={vi.fn()}
        onNewFolder={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows rename for a visible resource menu', () => {
    render(
      <ContextMenu
        state={{ visible: true, x: 12, y: 24, resource: makeResource({ title: 'Alpha' }) }}
        onClose={vi.fn()}
        onRename={vi.fn()}
        onMove={vi.fn()}
        onMoveToProject={vi.fn()}
        onColorChange={vi.fn()}
        onDelete={vi.fn()}
        onNewFolder={vi.fn()}
      />,
    );
    expect(screen.getByRole('menuitem', { name: /renombrar|rename/i })).toBeInTheDocument();
  });
});
