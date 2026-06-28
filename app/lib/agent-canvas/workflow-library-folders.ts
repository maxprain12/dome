import type { DomeWorkflowFolder } from '@/types';

export function childFolders(
  visibleFolders: DomeWorkflowFolder[],
  parentId: string | null,
): DomeWorkflowFolder[] {
  return visibleFolders
    .filter((f) => (f.parentId ?? null) === parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
}
