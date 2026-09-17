import type { TreeNodeData } from './sidebarHelpers';

export type VisibleTreeItem = {
  id: string;
  node: TreeNodeData;
  depth: number;
  parentId: string | null;
};

export function flattenVisibleTree(
  nodes: TreeNodeData[],
  expandedIds: Set<string>,
  parentId: string | null = null,
  depth = 0,
): VisibleTreeItem[] {
  const rows: VisibleTreeItem[] = [];
  for (const node of nodes) {
    rows.push({ id: node.id, node, depth, parentId });
    if (node.type === 'folder' && expandedIds.has(node.id) && node.children?.length) {
      rows.push(...flattenVisibleTree(node.children, expandedIds, node.id, depth + 1));
    }
  }
  return rows;
}

export function nextVisibleTreeId(
  rows: VisibleTreeItem[],
  currentId: string | null,
  delta: number,
): string | null {
  if (rows.length === 0) return null;
  if (!currentId) return delta >= 0 ? rows[0].id : rows[rows.length - 1].id;
  const index = rows.findIndex((row) => row.id === currentId);
  if (index < 0) return rows[0].id;
  const next = Math.min(rows.length - 1, Math.max(0, index + delta));
  return rows[next]?.id ?? null;
}

export function treeParentId(rows: VisibleTreeItem[], id: string): string | null {
  return rows.find((row) => row.id === id)?.parentId ?? null;
}
