import type { ReactNode } from 'react';

export interface HubToolbarProps {
  /** Left: title block or custom node */
  leading?: ReactNode;
  /** Center: typically search */
  center?: ReactNode;
  /** Right: actions, chips, CTAs */
  trailing?: ReactNode;
  /** Compact variant: less vertical padding */
  dense?: boolean;
  className?: string;
}

/**
 * Unified top bar for hub workspaces — dense, single border-bottom.
 */
export default function HubToolbar({ leading, center, trailing, dense, className = '' }: HubToolbarProps) {
  const py = dense ? 'py-2' : 'py-2.5';
  return (
    <header
      className={`shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 px-4 ${py} ${className}`.trim()}
      style={{ borderBottom: '1px solid var(--dome-border)', background: 'var(--dome-bg)' }}
    >
      {leading ? <div className="flex items-center gap-2.5 min-w-0 shrink-0 sm:max-w-[40%]">{leading}</div> : null}
      {center != null && center !== false ? (
        <div className="flex-1 min-w-0 flex items-center justify-center sm:justify-stretch order-3 sm:order-none">
          {center}
        </div>
      ) : null}
      {trailing != null && trailing !== false ? (
        <div className="flex flex-wrap items-center gap-1.5 justify-end shrink-0 order-2 sm:order-none">{trailing}</div>
      ) : null}
    </header>
  );
}
