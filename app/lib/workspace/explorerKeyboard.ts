export type ExplorerKeyCommand =
  | 'selectAll'
  | 'rename'
  | 'quickLook'
  | 'delete'
  | 'escape'
  | 'open'
  | 'duplicate'
  | 'arrowUp'
  | 'arrowDown'
  | 'arrowLeft'
  | 'arrowRight';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (EDITABLE_TAGS.has(target.tagName)) return true;
  return Boolean(target.closest('[role="textbox"], [contenteditable="true"]'));
}

export function isExplorerUiBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      '[role="dialog"], [role="menu"], [role="listbox"], [data-slot="dialog-content"], [data-slot="dropdown-menu-content"], [data-slot="context-menu-content"]',
    ),
  );
}

export function classifyExplorerKey(event: KeyboardEvent): ExplorerKeyCommand | null {
  if (isEditableTarget(event.target) || isExplorerUiBlocked(event.target)) return null;

  const meta = event.metaKey || event.ctrlKey;
  const key = event.key;

  if (meta && key.toLowerCase() === 'a') return 'selectAll';
  if (meta && key.toLowerCase() === 'd') return 'duplicate';
  if (key === 'F2') return 'rename';
  if (key === ' ' || key === 'Spacebar') return 'quickLook';
  if (key === 'Delete' || key === 'Backspace') return 'delete';
  if (key === 'Escape') return 'escape';
  if (key === 'Enter') return 'open';
  if (key === 'ArrowUp') return 'arrowUp';
  if (key === 'ArrowDown') return 'arrowDown';
  if (key === 'ArrowLeft') return 'arrowLeft';
  if (key === 'ArrowRight') return 'arrowRight';
  return null;
}

export function explorerModHint(platform: string | undefined): '⌘' | 'Ctrl' {
  return platform !== undefined && /Mac|iPhone|iPad/i.test(platform) ? '⌘' : 'Ctrl';
}
