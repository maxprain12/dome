import type { CanvasWorkflow } from '@/types/canvas';
import type { DomeWorkflowFolder } from '@/types';

export const DND_WORKFLOW_MIME = 'application/x-dome-workflow-id';

export function folderByIdMap(folders: DomeWorkflowFolder[]): Map<string, DomeWorkflowFolder> {
  const m = new Map<string, DomeWorkflowFolder>();
  for (const f of folders) m.set(f.id, f);
  return m;
}

export function wfMatchesSearch(wf: CanvasWorkflow, q: string): boolean {
  if (!q) return true;
  const n = wf.name.toLowerCase();
  const d = (wf.description || '').toLowerCase();
  return n.includes(q) || d.includes(q);
}

export function folderNameMatches(folder: DomeWorkflowFolder, q: string): boolean {
  if (!q) return true;
  return folder.name.toLowerCase().includes(q);
}

export function wfVisibleInSearch(
  wf: CanvasWorkflow,
  q: string,
  map: Map<string, DomeWorkflowFolder>,
): boolean {
  if (!q) return true;
  if (wfMatchesSearch(wf, q)) return true;
  let cur = wf.folderId ?? null;
  while (cur) {
    const f = map.get(cur);
    if (!f) break;
    if (folderNameMatches(f, q)) return true;
    cur = f.parentId;
  }
  return false;
}

export function folderVisibleInSearch(
  folder: DomeWorkflowFolder,
  q: string,
  allFolders: DomeWorkflowFolder[],
  workflows: CanvasWorkflow[],
  map: Map<string, DomeWorkflowFolder>,
): boolean {
  if (!q) return true;
  if (folderNameMatches(folder, q)) return true;
  if (workflows.some((w) => w.folderId === folder.id && wfVisibleInSearch(w, q, map))) return true;
  return allFolders
    .filter((c) => c.parentId === folder.id)
    .some((c) => folderVisibleInSearch(c, q, allFolders, workflows, map));
}
