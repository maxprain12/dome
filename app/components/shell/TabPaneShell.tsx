import type { ReactNode } from 'react';

type TabPaneShellProps = { tabId: string; isActive: boolean; isPersistent: boolean; children: ReactNode };

/** Persistent panes keep their state; the active surface is immediately visible. */
export default function TabPaneShell({ tabId, isActive, isPersistent, children }: TabPaneShellProps) {
  if (!isActive && !isPersistent) return null;
  return (
    <div data-tab-pane={tabId}
      className={isActive ? 'absolute inset-0 flex flex-col min-h-0 min-w-0 overflow-hidden z-[1]' : 'hidden'}
      style={{ background: 'var(--background)' }} aria-hidden={!isActive}>
      {children}
    </div>
  );
}
