/** Shared layout localStorage keys and defaults for shell reset. */
export const MANY_PANEL_WIDTH_KEY = 'dome:many-panel-width-v1';
export const RESIZE_STORE_KEY = 'dome-resize-store';

export const LAYOUT_DEFAULTS = {
  manyPanelWidth: 380,
  leftSidebarWidth: 288,
  rightSidebarWidth: 380,
  chatSidebarWidth: 320,
} as const;

export const LAYOUT_RESET_EVENT = 'dome:layout-reset';

/** Clear persisted layout widths and notify AppShell / resize store. */
export function resetLayoutPreferences(): void {
  try {
    localStorage.removeItem(MANY_PANEL_WIDTH_KEY);
    localStorage.removeItem(RESIZE_STORE_KEY);
  } catch {
    /* private browsing / quota */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LAYOUT_RESET_EVENT));
  }
}
