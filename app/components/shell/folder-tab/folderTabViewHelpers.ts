/**
 * Pure helpers extracted from FolderTabView for Sonar S3776
 * (cognitive complexity). Behavior must stay identical to the prior inlines.
 */

import type { Resource } from '@/lib/hooks/useResources';
import { getFolderColor, type FolderTabViewContext } from './folderTabShared';

export type FolderViewMode = 'grid' | 'list';
export const FOLDER_VIEW_MODE_KEY = 'dome:folder-view-mode';
export const FOLDER_VIEW_MODE_DEFAULT: FolderViewMode = 'grid';

export type ProjectTag = {
  id: string;
  name: string;
  color?: string | null;
  resource_count: number;
};

export type FolderListEntry = { item: Resource; isFolder: boolean };

export function readFolderViewMode(): FolderViewMode {
  if (typeof globalThis.window === 'undefined') return FOLDER_VIEW_MODE_DEFAULT;
  try {
    const raw = globalThis.window.localStorage.getItem(FOLDER_VIEW_MODE_KEY);
    return raw === 'list' || raw === 'grid' ? raw : FOLDER_VIEW_MODE_DEFAULT;
  } catch {
    return FOLDER_VIEW_MODE_DEFAULT;
  }
}

export function partitionFolderChildren(
  allResources: Resource[],
  viewCtx: FolderTabViewContext,
  folderId: string,
): { subfolders: Resource[]; files: Resource[] } {
  let list = allResources;
  if (viewCtx.isProjectRoot) {
    list = list.filter((r) => r.project_id === viewCtx.projectId && !r.folder_id);
  } else {
    list = list.filter((r) => r.folder_id === folderId);
    if (viewCtx.projectId) {
      list = list.filter((r) => r.project_id === viewCtx.projectId);
    }
  }
  return {
    subfolders: list.filter((r) => r.type === 'folder'),
    files: list.filter((r) => r.type !== 'folder'),
  };
}

export function buildResourceMapForSelection(opts: {
  subfolders: Resource[];
  files: Resource[];
  folderId: string;
  isProjectRoot: boolean;
  getBreadcrumbPath: (id: string) => Resource[];
  getFolderById: (id: string) => Resource | undefined;
}): Map<string, Resource> {
  const m = new Map<string, Resource>();
  for (const f of opts.subfolders) m.set(f.id, f);
  for (const f of opts.files) m.set(f.id, f);
  if (!opts.isProjectRoot) {
    for (const p of opts.getBreadcrumbPath(opts.folderId)) m.set(p.id, p);
    const cur = opts.getFolderById(opts.folderId);
    if (cur) m.set(cur.id, cur);
  }
  return m;
}

export function buildFolderListItems(opts: {
  tagFilterId: string | null;
  allResources: Resource[];
  effectiveProjectId: string;
  taggedResourceIds: Set<string>;
  subfolders: Resource[];
  files: Resource[];
}): FolderListEntry[] {
  if (opts.tagFilterId) {
    return opts.allResources
      .filter(
        (r) =>
          r.project_id === opts.effectiveProjectId &&
          opts.taggedResourceIds.has(r.id) &&
          r.type !== 'folder',
      )
      .map((item) => ({ item, isFolder: false as const }));
  }
  const folders = opts.subfolders.map((f) => ({ item: f, isFolder: true as const }));
  const docs = opts.files.map((f) => ({ item: f, isFolder: false as const }));
  return [...folders, ...docs];
}

export function filterListItemsBySearch(
  listItems: FolderListEntry[],
  normalizedSearchQuery: string,
  untitledLabel: string,
): FolderListEntry[] {
  if (!normalizedSearchQuery) return listItems;
  return listItems.filter(({ item }) =>
    (item.title ?? untitledLabel).toLowerCase().includes(normalizedSearchQuery),
  );
}

export function resolveEffectiveProjectId(opts: {
  isProjectRoot: boolean;
  viewProjectId: string;
  currentFolderProjectId?: string | null;
  currentProjectId?: string | null;
}): string {
  if (opts.isProjectRoot) return opts.viewProjectId;
  return opts.currentFolderProjectId ?? opts.currentProjectId ?? 'default';
}

export function folderSearchModHint(platform: string | undefined): string {
  return platform !== undefined && /Mac|iPhone|iPad/i.test(platform) ? '⌘F' : 'Ctrl+F';
}

export function folderRevealLabel(
  platform: string | undefined,
  finderLabel: string,
  explorerLabel: string,
): string {
  return platform !== undefined && /Mac|iPhone|iPad/i.test(platform)
    ? finderLabel
    : explorerLabel;
}

export type FolderViewStatus = {
  itemCount: number;
  visibleCount: number;
  isEmpty: boolean;
  showNoResults: boolean;
  rowsToRender: FolderListEntry[];
  statusLabel: string;
};

export function computeFolderViewStatus(opts: {
  tagFilterId: string | null;
  listItems: FolderListEntry[];
  subfoldersLen: number;
  filesLen: number;
  creatingFolder: boolean;
  isFiltering: boolean;
  isTagFiltering: boolean;
  filteredListItems: FolderListEntry[];
  activeTagName?: string;
  statusTag: (args: { name: string; count: number }) => string;
  statusSearch: (args: { count: number; total: number }) => string;
  statusCount: (args: { count: number }) => string;
}): FolderViewStatus {
  const itemCount = opts.tagFilterId
    ? opts.listItems.length
    : opts.subfoldersLen + opts.filesLen;
  const visibleCount =
    opts.isFiltering || opts.isTagFiltering ? opts.filteredListItems.length : itemCount;
  const isEmpty = !opts.isTagFiltering && itemCount === 0 && !opts.creatingFolder;
  const showNoResults =
    (opts.isFiltering || opts.isTagFiltering) && opts.filteredListItems.length === 0;
  const rowsToRender =
    opts.isFiltering || opts.isTagFiltering ? opts.filteredListItems : opts.listItems;

  let statusLabel: string;
  if (opts.isTagFiltering && opts.activeTagName) {
    statusLabel = opts.statusTag({ name: opts.activeTagName, count: visibleCount });
  } else if (opts.isFiltering) {
    statusLabel = opts.statusSearch({ count: visibleCount, total: itemCount });
  } else {
    statusLabel = opts.statusCount({ count: itemCount });
  }

  return { itemCount, visibleCount, isEmpty, showNoResults, rowsToRender, statusLabel };
}

/** Color picker anchor from the folder menu button rect. */
export function colorPickerPositionFromRect(rect: DOMRect): { top: number; left: number } {
  const popoverWidth = 196;
  const left = Math.min(
    Math.max(8, rect.right - popoverWidth),
    globalThis.window.innerWidth - popoverWidth - 8,
  );
  const top = Math.min(rect.bottom + 6, globalThis.window.innerHeight - 100);
  return { top, left };
}

export function tabColorFromFolderMeta(color: string | undefined): string | undefined {
  return color?.startsWith('#') ? color : undefined;
}

export async function revealFolderOrVault(opts: {
  isProjectRoot: boolean;
  currentFolder: Resource | undefined;
  effectiveProjectId: string;
}): Promise<void> {
  if (opts.isProjectRoot || !opts.currentFolder) {
    await globalThis.window.electron?.resource?.openVaultRoot(opts.effectiveProjectId);
    return;
  }
  const res = await globalThis.window.electron?.resource?.getFilePath(opts.currentFolder.id);
  if (res?.success && typeof res.data === 'string') {
    await globalThis.window.electron?.openPath?.(res.data);
  } else {
    await globalThis.window.electron?.resource?.openVaultRoot(opts.effectiveProjectId);
  }
}

export async function importPathsIntoFolderView(opts: {
  paths: string[];
  effectiveProjectId: string;
  listFolderId: string | null;
  refetch: () => Promise<unknown>;
}): Promise<void> {
  if (!opts.paths.length || !globalThis.window.electron?.resource?.importMultiple) return;
  const result = await globalThis.window.electron.resource.importMultiple(
    opts.paths,
    opts.effectiveProjectId,
  );
  if (opts.listFolderId && result?.data?.length) {
    const moves: Promise<unknown>[] = [];
    for (const entry of result.data) {
      if (!entry.success || !entry.data?.id) continue;
      moves.push(
        globalThis.window.electron?.db?.resources?.moveToFolder(entry.data.id, opts.listFolderId),
      );
    }
    await Promise.all(moves);
  }
  await opts.refetch();
}

export async function openNoteInWindow(item: Resource): Promise<void> {
  if (!globalThis.window.electron?.invoke || item.type !== 'note') return;
  try {
    await globalThis.window.electron.invoke('window:create', {
      id: `note-focus:${item.id}`,
      route: `/focus/note/${encodeURIComponent(item.id)}`,
      options: {
        width: 960,
        height: 760,
        minWidth: 560,
        minHeight: 480,
        title: `${item.title || 'Nota'} — Dome`,
        transparent: false,
      },
    });
  } catch (err) {
    console.error('[FolderTabView] Failed to open popout:', err);
  }
}

export function createUrlResourcePayload(opts: {
  url: string;
  effectiveProjectId: string;
  listFolderId: string | null;
}): Record<string, unknown> | null {
  if (!opts.url || !globalThis.window.electron?.db?.resources?.create) return null;
  const now = Date.now();
  return {
    id: `res_${now}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'url',
    title: opts.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
    project_id: opts.effectiveProjectId,
    folder_id: opts.listFolderId,
    content: opts.url,
    created_at: now,
    updated_at: now,
  };
}

export function createUntitledNotePayload(opts: {
  title: string;
  effectiveProjectId: string;
  listFolderId: string | null;
}): {
  id: string;
  type: 'note';
  title: string;
  content: string;
  project_id: string;
  folder_id: string | null;
  created_at: number;
  updated_at: number;
} {
  const now = Date.now();
  return {
    id: `res_${now}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'note' as const,
    title: opts.title,
    content: '',
    project_id: opts.effectiveProjectId,
    folder_id: opts.listFolderId,
    created_at: now,
    updated_at: now,
  };
}

export function toggleIdInSet(prev: Set<string>, id: string): Set<string> {
  const n = new Set(prev);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
}

export async function runBulkMoveToFolder(opts: {
  folderMoveIds: string[] | null;
  selectedIds: Set<string>;
  resourceMapForSelection: Map<string, Resource>;
  targetFolderId: string | null;
  moveToFolder: (id: string, folderId: string | null) => Promise<boolean>;
  filterRoots: (
    selectedIds: Set<string>,
    map: Map<string, Resource>,
  ) => string[];
}): Promise<'cleared-selection' | 'kept-selection'> {
  const roots =
    opts.folderMoveIds ?? opts.filterRoots(opts.selectedIds, opts.resourceMapForSelection);
  for (const rid of roots) {
    const ok = await opts.moveToFolder(rid, opts.targetFolderId);
    if (!ok) break;
  }
  return opts.folderMoveIds ? 'kept-selection' : 'cleared-selection';
}

export async function runBulkDelete(
  selectedIds: Set<string>,
  refetch: () => Promise<unknown>,
): Promise<boolean> {
  if (selectedIds.size === 0) return false;
  const res = await globalThis.window.electron?.db?.resources?.bulkDelete([...selectedIds]);
  if (!res?.success) return false;
  await refetch();
  return true;
}

export async function runCreateUntitledNote(opts: {
  title: string;
  effectiveProjectId: string;
  listFolderId: string | null;
  openResourceTab: (id: string, type: string, title: string, projectId: string) => void;
}): Promise<void> {
  if (!globalThis.window.electron?.db?.resources?.create) return;
  const res = createUntitledNotePayload({
    title: opts.title,
    effectiveProjectId: opts.effectiveProjectId,
    listFolderId: opts.listFolderId,
  });
  const result = await globalThis.window.electron.db.resources.create(res);
  if (result.success && result.data) {
    opts.openResourceTab(result.data.id, 'note', result.data.title, opts.effectiveProjectId);
  }
}

export async function runUploadIntoView(
  importPathsIntoView: (paths: string[]) => Promise<void>,
): Promise<void> {
  if (!globalThis.window.electron?.selectFiles) return;
  const paths = await globalThis.window.electron.selectFiles({
    properties: ['openFile', 'multiSelections'],
  });
  if (!paths?.length) return;
  await importPathsIntoView(paths);
}

export function runAddUrl(opts: {
  url: string;
  effectiveProjectId: string;
  listFolderId: string | null;
}): void {
  const payload = createUrlResourcePayload(opts);
  if (payload) {
    void globalThis.window.electron?.db?.resources?.create(payload);
  }
}

export async function runApplyFolderColor(opts: {
  currentFolder: Resource | undefined;
  folderId: string;
  color: string;
  updateResource: (id: string, patch: Partial<Resource>) => Promise<unknown>;
  updateTab: (id: string, patch: { color: string }) => void;
}): Promise<boolean> {
  if (!opts.currentFolder) return false;
  const currentMeta = (opts.currentFolder.metadata as Record<string, unknown>) ?? {};
  await opts.updateResource(opts.folderId, { metadata: { ...currentMeta, color: opts.color } });
  opts.updateTab(`folder:${opts.folderId}`, { color: opts.color });
  return true;
}

export async function runSubfolderColor(opts: {
  id: string;
  color: string;
  folder: Resource;
  updateResource: (id: string, patch: Partial<Resource>) => Promise<unknown>;
  updateTab: (id: string, patch: { color: string }) => void;
}): Promise<void> {
  const currentMeta = (opts.folder.metadata as Record<string, unknown>) ?? {};
  await opts.updateResource(opts.id, { metadata: { ...currentMeta, color: opts.color } });
  opts.updateTab(`folder:${opts.id}`, { color: opts.color });
}

export function resolveFolderChromeColor(currentFolder: Resource | undefined): {
  folderColor: string;
  folderColorHex: string | null;
} {
  const folderColor = currentFolder ? getFolderColor(currentFolder) : 'var(--primary)';
  const folderColorHex = folderColor.startsWith('#') ? folderColor : null;
  return { folderColor, folderColorHex };
}

export function buildTabColorKey(
  folderId: string,
  folderColorHex: string | null,
  isProjectRoot: boolean,
): string {
  if (!folderColorHex || isProjectRoot) return '';
  return `${folderId}:${folderColorHex}`;
}

export function canOpenResourceInSplit(
  activeTabId: string | null,
  tabs: Array<{ id: string; resourceId?: string | null }>,
): boolean {
  if (activeTabId === null || activeTabId === 'home') return false;
  return Boolean(tabs.find((tb) => tb.id === activeTabId)?.resourceId);
}

export function buildBreadcrumbExcludingCurrent(
  isProjectRoot: boolean,
  folderId: string,
  getBreadcrumbPath: (id: string) => Resource[],
): Resource[] {
  if (isProjectRoot) return [];
  return getBreadcrumbPath(folderId).filter((f) => f.id !== folderId);
}

export function persistFolderViewMode(next: FolderViewMode): void {
  try {
    globalThis.window.localStorage.setItem(FOLDER_VIEW_MODE_KEY, next);
  } catch {
    /* ignore */
  }
}
