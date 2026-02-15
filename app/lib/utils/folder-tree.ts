/**
 * Shared folder tree utilities for InlineFolderNav and FolderTreePane.
 * Uses immutable .toSorted() to avoid mutating input arrays.
 */

export interface FolderLike {
  id: string;
  folder_id?: string | null;
  title: string;
}

export interface FolderNode<T extends FolderLike = FolderLike> {
  folder: T;
  children: FolderNode<T>[];
}

function sortTreeNodes<T extends FolderLike>(nodes: FolderNode<T>[]): FolderNode<T>[] {
  return nodes
    .toSorted((a, b) => a.folder.title.localeCompare(b.folder.title))
    .map((n) => ({
      ...n,
      children: sortTreeNodes(n.children),
    }));
}

export function buildFolderTree<T extends FolderLike>(folders: T[]): FolderNode<T>[] {
  const byId = new Map<string, FolderNode<T>>();
  for (const f of folders) {
    byId.set(f.id, { folder: f, children: [] });
  }
  const roots: FolderNode<T>[] = [];
  for (const f of folders) {
    const node = byId.get(f.id)!;
    const parentId = f.folder_id ?? null;
    if (!parentId) {
      roots.push(node);
    } else {
      const parent = byId.get(parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }
  return sortTreeNodes(roots);
}
