import { describe, expect, it } from 'vitest';
import { sortExplorerEntries, type SortableExplorerEntry } from './explorerSort';
import {
  applyExplorerPointerSelect,
  moveExplorerFocus,
  selectAllIds,
  isExplorerMultiSelectEvent,
} from './explorerSelection';
import {
  canDropExplorerItems,
  explorerDragIdsForItem,
  isDescendantOf,
  type ExplorerNode,
} from './explorerDnD';
import { classifyExplorerKey, isEditableTarget } from './explorerKeyboard';
import { resourceTypeBadge, resourceTypeI18nKey } from './explorerTypeLabels';
import type { Resource } from '@/lib/hooks/useResources';

function entry(
  partial: Partial<SortableExplorerEntry['item']> & { id?: string; isFolder?: boolean },
): SortableExplorerEntry {
  return {
    isFolder: partial.isFolder ?? false,
    item: {
      title: partial.title ?? 'Item',
      type: partial.type ?? 'note',
      updated_at: partial.updated_at ?? 0,
    },
  };
}

function node(partial: ExplorerNode): ExplorerNode {
  return partial;
}

describe('sortExplorerEntries', () => {
  it('keeps folders first then sorts files by name', () => {
    const rows = [
      entry({ title: 'zeta', type: 'note', isFolder: false }),
      entry({ title: 'Beta', type: 'folder', isFolder: true }),
      entry({ title: 'alpha', type: 'pdf', isFolder: false }),
      entry({ title: 'Alpha', type: 'folder', isFolder: true }),
    ];
    const sorted = sortExplorerEntries(rows, { key: 'name', dir: 'asc', untitled: 'Untitled' });
    expect(sorted.map((r) => r.item.title)).toEqual(['Alpha', 'Beta', 'alpha', 'zeta']);
  });

  it('sorts by date descending within folders and files', () => {
    const rows = [
      entry({ title: 'old-file', updated_at: 1, isFolder: false }),
      entry({ title: 'new-file', updated_at: 9, isFolder: false }),
      entry({ title: 'old-folder', updated_at: 2, isFolder: true }),
      entry({ title: 'new-folder', updated_at: 8, isFolder: true }),
    ];
    const sorted = sortExplorerEntries(rows, { key: 'date', dir: 'desc', untitled: 'Untitled' });
    expect(sorted.map((r) => r.item.title)).toEqual([
      'new-folder',
      'old-folder',
      'new-file',
      'old-file',
    ]);
  });
});

describe('applyExplorerPointerSelect', () => {
  const orderedIds = ['a', 'b', 'c', 'd'];

  it('replaces selection on a plain click', () => {
    const next = applyExplorerPointerSelect({
      id: 'c',
      orderedIds,
      selectedIds: new Set(['a']),
      anchorId: 'a',
      additive: false,
      range: false,
    });
    expect([...next.selectedIds]).toEqual(['c']);
    expect(next.anchorId).toBe('c');
  });

  it('toggles with additive click', () => {
    const next = applyExplorerPointerSelect({
      id: 'c',
      orderedIds,
      selectedIds: new Set(['a']),
      anchorId: 'a',
      additive: true,
      range: false,
    });
    expect(next.selectedIds.has('a')).toBe(true);
    expect(next.selectedIds.has('c')).toBe(true);
  });

  it('selects a range from the anchor', () => {
    const next = applyExplorerPointerSelect({
      id: 'd',
      orderedIds,
      selectedIds: new Set(['b']),
      anchorId: 'b',
      additive: false,
      range: true,
    });
    expect([...next.selectedIds]).toEqual(['b', 'c', 'd']);
    expect(next.anchorId).toBe('b');
  });
});

describe('moveExplorerFocus / selectAllIds', () => {
  it('walks the ordered list and wraps at the edges', () => {
    expect(moveExplorerFocus({ orderedIds: ['a', 'b'], currentId: 'a', delta: 1 })).toBe('b');
    expect(moveExplorerFocus({ orderedIds: ['a', 'b'], currentId: 'b', delta: 1 })).toBe('b');
    expect(moveExplorerFocus({ orderedIds: ['a', 'b'], currentId: null, delta: -1 })).toBe('b');
    expect([...selectAllIds(['a', 'b'])]).toEqual(['a', 'b']);
  });
});

describe('canDropExplorerItems', () => {
  const byId = new Map<string, ExplorerNode>([
    ['root', node({ id: 'root', type: 'folder', folder_id: null, project_id: 'p1' })],
    ['child', node({ id: 'child', type: 'folder', folder_id: 'root', project_id: 'p1' })],
    ['note', node({ id: 'note', type: 'note', folder_id: 'root', project_id: 'p1' })],
    ['other', node({ id: 'other', type: 'folder', folder_id: null, project_id: 'p2' })],
  ]);

  it('blocks dropping a folder into itself or a descendant', () => {
    expect(isDescendantOf('child', 'root', byId)).toBe(true);
    expect(canDropExplorerItems({
      sourceIds: ['root'],
      targetFolderId: 'child',
      projectId: 'p1',
      byId,
    })).toEqual({ ok: false, reason: 'descendant' });
    expect(canDropExplorerItems({
      sourceIds: ['root'],
      targetFolderId: 'root',
      projectId: 'p1',
      byId,
    })).toEqual({ ok: false, reason: 'self' });
  });

  it('blocks cross-project moves and no-ops', () => {
    expect(canDropExplorerItems({
      sourceIds: ['note'],
      targetFolderId: 'other',
      projectId: 'p1',
      byId,
    })).toEqual({ ok: false, reason: 'cross-project' });
    expect(canDropExplorerItems({
      sourceIds: ['note'],
      targetFolderId: 'root',
      projectId: 'p1',
      byId,
    })).toEqual({ ok: false, reason: 'noop' });
  });

  it('allows moving a note into a sibling folder', () => {
    expect(canDropExplorerItems({
      sourceIds: ['note'],
      targetFolderId: 'child',
      projectId: 'p1',
      byId,
    })).toEqual({ ok: true });
  });

  it('uses selection roots when dragging a selected item', () => {
    const resources = new Map<string, Resource>([
      ['root', { id: 'root', type: 'folder', title: 'Root', project_id: 'p1', folder_id: null, created_at: 0, updated_at: 0 }],
      ['note', { id: 'note', type: 'note', title: 'Note', project_id: 'p1', folder_id: 'root', created_at: 0, updated_at: 0 }],
    ]);
    expect(explorerDragIdsForItem('note', new Set(['root', 'note']), resources)).toEqual(['root']);
    expect(explorerDragIdsForItem('note', new Set(['note']), resources)).toEqual(['note']);
  });
});

describe('classifyExplorerKey', () => {
  it('ignores keys originating from inputs', () => {
    const input = document.createElement('input');
    expect(isEditableTarget(input)).toBe(true);
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    Object.defineProperty(event, 'target', { value: input });
    expect(classifyExplorerKey(event)).toBeNull();
  });

  it('maps native explorer shortcuts', () => {
    expect(classifyExplorerKey(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe('open');
    expect(classifyExplorerKey(new KeyboardEvent('keydown', { key: ' ' }))).toBe('quickLook');
    expect(classifyExplorerKey(new KeyboardEvent('keydown', { key: 'F2' }))).toBe('rename');
    expect(classifyExplorerKey(new KeyboardEvent('keydown', { key: 'a', metaKey: true }))).toBe('selectAll');
    expect(classifyExplorerKey(new KeyboardEvent('keydown', { key: 'Delete' }))).toBe('delete');
  });
});

describe('resourceTypeI18nKey', () => {
  it('maps known types and falls back for unknown files', () => {
    expect(resourceTypeI18nKey('pdf')).toBe('folder.typePdf');
    expect(resourceTypeI18nKey('note', true)).toBe('folder.typeFolder');
    expect(resourceTypeI18nKey('weird')).toBe('folder.typeFile');
  });
});

describe('resourceTypeBadge', () => {
  it('prefers the filename extension', () => {
    expect(resourceTypeBadge('image', 'social-card.png')).toBe('PNG');
    expect(resourceTypeBadge('document', 'demo.docx')).toBe('DOCX');
  });

  it('falls back to a short type badge', () => {
    expect(resourceTypeBadge('pdf')).toBe('PDF');
    expect(resourceTypeBadge('excel')).toBe('XLSX');
    expect(resourceTypeBadge('mystery')).toBe('FILE');
  });
});

describe('isExplorerMultiSelectEvent', () => {
  it('treats modifier clicks as multi-select', () => {
    expect(isExplorerMultiSelectEvent({ metaKey: true })).toBe(true);
    expect(isExplorerMultiSelectEvent({ ctrlKey: true })).toBe(true);
    expect(isExplorerMultiSelectEvent({ shiftKey: true })).toBe(true);
    expect(isExplorerMultiSelectEvent({})).toBe(false);
  });
});
