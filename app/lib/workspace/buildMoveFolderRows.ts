import type { Resource } from '@/lib/hooks/useResources';

export type MoveFolderRow = { folder: Resource; depth: number };

/** Flatten project folders into an indented tree for the move-folder picker. */
export function buildMoveFolderRows(opts: {
  allFolders: Resource[];
  movingIds: Iterable<string>;
  projectId: string;
  /** Folder the items already live in — excluded as a move target. */
  excludeFolderId?: string | null;
}): MoveFolderRow[] {
  const { allFolders, movingIds, projectId, excludeFolderId } = opts;
  const moving = new Set(movingIds);
  const projectFolders = allFolders.filter((f) => f.project_id === projectId);
  const byId = new Map(projectFolders.map((f) => [f.id, f] as const));

  const excluded = new Set<string>();
  const markSubtree = (id: string) => {
    if (excluded.has(id)) return;
    excluded.add(id);
    for (const f of projectFolders) {
      if (f.folder_id === id) markSubtree(f.id);
    }
  };
  for (const id of moving) markSubtree(id);
  if (excludeFolderId) excluded.add(excludeFolderId);

  const childrenOf = new Map<string | null, Resource[]>();
  for (const f of projectFolders) {
    if (excluded.has(f.id)) continue;
    const parentId =
      f.folder_id && byId.has(f.folder_id) && !excluded.has(f.folder_id) ? f.folder_id : null;
    const arr = childrenOf.get(parentId) ?? [];
    arr.push(f);
    childrenOf.set(parentId, arr);
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
  }

  const rows: MoveFolderRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const f of childrenOf.get(parentId) ?? []) {
      rows.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}
