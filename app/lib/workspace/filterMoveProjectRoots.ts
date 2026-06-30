import type { Resource } from '@/lib/hooks/useResources';

/** Evita mover un hijo y un padre seleccionados: solo se mueven las raíces del conjunto. */
export function filterMoveProjectRoots(selectedIds: Set<string>, byId: Map<string, Resource>): string[] {
  const roots: string[] = [];
  for (const id of selectedIds) {
    if (!byId.has(id)) {
      roots.push(id);
      continue;
    }
    let cur: Resource | undefined = byId.get(id);
    let nestedInSelection = false;
    let guard = 0;
    while (cur?.folder_id && guard++ < 500) {
      if (selectedIds.has(cur.folder_id)) {
        nestedInSelection = true;
        break;
      }
      cur = byId.get(cur.folder_id);
    }
    if (!nestedInSelection) roots.push(id);
  }
  return roots;
}
