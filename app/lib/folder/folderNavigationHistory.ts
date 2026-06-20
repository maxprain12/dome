/** Per-tab folder navigation history (filesystem-style back / forward). */

export interface FolderLocation {
  id: string;
  title: string;
  color?: string;
}

interface HistoryState {
  entries: FolderLocation[];
  index: number;
}

const histories = new Map<string, HistoryState>();

export function initFolderHistory(tabId: string, location: FolderLocation): void {
  if (!histories.has(tabId)) {
    histories.set(tabId, { entries: [{ ...location }], index: 0 });
  }
}

export function getFolderHistory(tabId: string): HistoryState | undefined {
  return histories.get(tabId);
}

export function migrateFolderHistory(oldTabId: string, newTabId: string): void {
  const h = histories.get(oldTabId);
  if (h) {
    histories.set(newTabId, h);
    histories.delete(oldTabId);
  }
}

export function removeFolderHistory(tabId: string): void {
  histories.delete(tabId);
}

/** Push a new location; returns false when already at that folder. */
export function pushFolderLocation(tabId: string, location: FolderLocation): boolean {
  const h = histories.get(tabId);
  if (!h) {
    initFolderHistory(tabId, location);
    return false;
  }
  const current = h.entries[h.index];
  if (current.id === location.id) return false;
  h.entries = h.entries.slice(0, h.index + 1);
  h.entries.push({ ...location });
  h.index = h.entries.length - 1;
  return true;
}

export function goBackInFolderHistory(tabId: string): FolderLocation | null {
  const h = histories.get(tabId);
  if (!h || h.index <= 0) return null;
  h.index -= 1;
  return h.entries[h.index];
}

export function goForwardInFolderHistory(tabId: string): FolderLocation | null {
  const h = histories.get(tabId);
  if (!h || h.index >= h.entries.length - 1) return null;
  h.index += 1;
  return h.entries[h.index];
}

export function canGoBackFolder(tabId: string): boolean {
  const h = histories.get(tabId);
  return !!h && h.index > 0;
}

export function canGoForwardFolder(tabId: string): boolean {
  const h = histories.get(tabId);
  return !!h && h.index < h.entries.length - 1;
}
