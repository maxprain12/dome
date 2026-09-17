import { filterMoveProjectRoots } from '@/lib/workspace/filterMoveProjectRoots';
import type { Resource } from '@/lib/hooks/useResources';

export const DOME_RESOURCES_MIME = 'application/x-dome-resources';

export type ExplorerDragPayload = {
  ids: string[];
  projectId: string;
};

export type ExplorerDropReason = 'self' | 'descendant' | 'cross-project' | 'noop' | 'missing';

export type ExplorerDropCheck =
  | { ok: true }
  | { ok: false; reason: ExplorerDropReason };

export type ExplorerNode = {
  id: string;
  type: string;
  folder_id?: string | null;
  project_id: string;
};

let activeDrag: ExplorerDragPayload | null = null;

export function beginExplorerDrag(payload: ExplorerDragPayload): void {
  activeDrag = payload;
}

export function endExplorerDrag(): void {
  activeDrag = null;
}

export function getActiveExplorerDrag(): ExplorerDragPayload | null {
  return activeDrag;
}

export function isOsFileDrag(types: Iterable<string> | DOMStringList | undefined): boolean {
  if (!types) return false;
  return Array.from(types as Iterable<string>).includes('Files');
}

export function isInternalResourceDrag(types: Iterable<string> | DOMStringList | undefined): boolean {
  if (!types) return false;
  return Array.from(types as Iterable<string>).includes(DOME_RESOURCES_MIME);
}

export function writeExplorerDrag(dataTransfer: DataTransfer, payload: ExplorerDragPayload): void {
  beginExplorerDrag(payload);
  dataTransfer.setData(DOME_RESOURCES_MIME, JSON.stringify(payload));
  dataTransfer.setData('text/plain', payload.ids.join(','));
  dataTransfer.effectAllowed = 'move';
}

export function readExplorerDrag(dataTransfer: DataTransfer | null): ExplorerDragPayload | null {
  if (activeDrag) return activeDrag;
  if (!dataTransfer) return null;
  const raw = dataTransfer.getData(DOME_RESOURCES_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ExplorerDragPayload;
    if (!parsed || !Array.isArray(parsed.ids) || typeof parsed.projectId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isDescendantOf(
  candidateId: string,
  ancestorId: string,
  byId: Map<string, ExplorerNode>,
): boolean {
  let current: ExplorerNode | undefined = byId.get(candidateId);
  let guard = 0;
  while (current?.folder_id && guard < 500) {
    guard += 1;
    if (current.folder_id === ancestorId) return true;
    current = byId.get(current.folder_id);
  }
  return false;
}

export function canDropExplorerItems(opts: {
  sourceIds: string[];
  targetFolderId: string | null;
  projectId: string;
  byId: Map<string, ExplorerNode>;
}): ExplorerDropCheck {
  const { sourceIds, targetFolderId, projectId, byId } = opts;
  if (sourceIds.length === 0) return { ok: false, reason: 'missing' };

  if (targetFolderId) {
    const folder = byId.get(targetFolderId);
    if (!folder || folder.type !== 'folder') return { ok: false, reason: 'missing' };
    if (folder.project_id !== projectId) return { ok: false, reason: 'cross-project' };
  }

  let noopCount = 0;
  for (const id of sourceIds) {
    const node = byId.get(id);
    if (!node) return { ok: false, reason: 'missing' };
    if (node.project_id !== projectId) return { ok: false, reason: 'cross-project' };
    if (targetFolderId && node.id === targetFolderId) return { ok: false, reason: 'self' };
    if (targetFolderId && node.type === 'folder' && isDescendantOf(targetFolderId, node.id, byId)) {
      return { ok: false, reason: 'descendant' };
    }
    if ((node.folder_id ?? null) === targetFolderId) noopCount += 1;
  }

  if (noopCount === sourceIds.length) return { ok: false, reason: 'noop' };
  return { ok: true };
}

export function explorerDragIdsForItem(
  itemId: string,
  selectedIds: Set<string>,
  byId: Map<string, Resource>,
): string[] {
  if (selectedIds.has(itemId) && selectedIds.size > 1) {
    return filterMoveProjectRoots(selectedIds, byId);
  }
  return [itemId];
}

export function setExplorerDragGhost(
  dataTransfer: DataTransfer,
  label: string,
  count: number,
): void {
  if (typeof document === 'undefined') return;
  const ghost = document.createElement('div');
  ghost.className = 'dome-explorer-drag-ghost';
  ghost.textContent = count > 1 ? `${label} +${String(count - 1)}` : label;
  document.body.appendChild(ghost);
  dataTransfer.setDragImage(ghost, 16, 16);
  requestAnimationFrame(() => {
    ghost.remove();
  });
}
