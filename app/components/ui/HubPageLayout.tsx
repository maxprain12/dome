import type { ReactNode } from 'react';

export interface HubPageLayoutProps {
  /** Optional top strip (e.g. hub section tabs when not using shell tabs) */
  secondaryNav?: ReactNode;
  /** Dense workspace header + toolbar row */
  header?: ReactNode;
  /** Main scrollable region */
  children: ReactNode;
  className?: string;
}

/**
 * Full-height column layout for Agents / Workflows / Automations / Runs workspaces.
 * Uses dome tokens for a consistent minimal-dense shell.
 */
export default function HubPageLayout({ secondaryNav, header, children, className = '' }: HubPageLayoutProps) {
  return (
    <div
      className={`flex flex-col h-full min-h-0 overflow-hidden ${className}`.trim()}
      style={{ background: 'var(--dome-bg)' }}
    >
      {secondaryNav}
      {header}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
    </div>
  );
}
