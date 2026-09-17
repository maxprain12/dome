import { describe, expect, it } from 'vitest';
import { flattenVisibleTree, nextVisibleTreeId, treeParentId } from './sidebarTreeNav';
import type { TreeNodeData } from './sidebarHelpers';

function folder(id: string, children?: TreeNodeData[]): TreeNodeData {
  return { id, name: id, type: 'folder', children };
}

function file(id: string): TreeNodeData {
  return { id, name: id, type: 'file' };
}

describe('flattenVisibleTree', () => {
  const tree = [
    folder('root', [file('a'), folder('nested', [file('b')])]),
    file('c'),
  ];

  it('hides collapsed folder children', () => {
    const rows = flattenVisibleTree(tree, new Set());
    expect(rows.map((row) => row.id)).toEqual(['root', 'c']);
  });

  it('includes expanded descendants and tracks parent ids', () => {
    const rows = flattenVisibleTree(tree, new Set(['root', 'nested']));
    expect(rows.map((row) => row.id)).toEqual(['root', 'a', 'nested', 'b', 'c']);
    expect(treeParentId(rows, 'b')).toBe('nested');
    expect(treeParentId(rows, 'root')).toBeNull();
  });
});

describe('nextVisibleTreeId', () => {
  const rows = flattenVisibleTree(
    [folder('root', [file('a')]), file('c')],
    new Set(['root']),
  );

  it('moves focus along the visible list', () => {
    expect(nextVisibleTreeId(rows, 'root', 1)).toBe('a');
    expect(nextVisibleTreeId(rows, 'c', 1)).toBe('c');
    expect(nextVisibleTreeId(rows, null, -1)).toBe('c');
  });
});
