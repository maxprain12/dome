export type ExplorerSortKey = 'name' | 'type' | 'date';
export type ExplorerSortDir = 'asc' | 'desc';

export type SortableExplorerEntry = {
  isFolder: boolean;
  item: { title?: string | null; type: string; updated_at: number | string };
};

export const EXPLORER_SORT_STORAGE_KEY = 'dome:folder-sort';
export const EXPLORER_SORT_DEFAULT: { key: ExplorerSortKey; dir: ExplorerSortDir } = {
  key: 'date',
  dir: 'desc',
};

export function readExplorerSort(): { key: ExplorerSortKey; dir: ExplorerSortDir } {
  if (typeof globalThis.window === 'undefined') return EXPLORER_SORT_DEFAULT;
  try {
    const raw = globalThis.window.localStorage.getItem(EXPLORER_SORT_STORAGE_KEY);
    if (!raw) return EXPLORER_SORT_DEFAULT;
    const parsed = JSON.parse(raw) as { key?: string; dir?: string };
    const key: ExplorerSortKey =
      parsed.key === 'name' || parsed.key === 'type' || parsed.key === 'date'
        ? parsed.key
        : EXPLORER_SORT_DEFAULT.key;
    const dir: ExplorerSortDir = parsed.dir === 'asc' || parsed.dir === 'desc'
      ? parsed.dir
      : EXPLORER_SORT_DEFAULT.dir;
    return { key, dir };
  } catch {
    return EXPLORER_SORT_DEFAULT;
  }
}

export function persistExplorerSort(next: { key: ExplorerSortKey; dir: ExplorerSortDir }): void {
  try {
    globalThis.window.localStorage.setItem(EXPLORER_SORT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

function entryStamp(entry: SortableExplorerEntry): number {
  const raw = entry.item.updated_at;
  if (typeof raw === 'number') return raw;
  const parsed = Date.parse(String(raw ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareEntries(
  a: SortableExplorerEntry,
  b: SortableExplorerEntry,
  key: ExplorerSortKey,
  untitled: string,
): number {
  switch (key) {
    case 'name':
      return compareText(a.item.title || untitled, b.item.title || untitled);
    case 'type':
      return compareText(a.item.type, b.item.type) || compareText(a.item.title || untitled, b.item.title || untitled);
    case 'date':
      return entryStamp(a) - entryStamp(b);
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

/** Folders stay first; files follow, both ordered by the active key. */
export function sortExplorerEntries<T extends SortableExplorerEntry>(
  entries: T[],
  opts: { key: ExplorerSortKey; dir: ExplorerSortDir; untitled: string },
): T[] {
  const folders = entries.filter((e) => e.isFolder);
  const files = entries.filter((e) => !e.isFolder);
  const dir = opts.dir === 'desc' ? -1 : 1;
  const byKey = (a: T, b: T) => compareEntries(a, b, opts.key, opts.untitled) * dir;
  folders.sort(byKey);
  files.sort(byKey);
  return [...folders, ...files];
}
