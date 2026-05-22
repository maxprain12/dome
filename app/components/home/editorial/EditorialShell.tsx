import type { ReactNode } from 'react';

export interface EditorialShellProps {
  children: ReactNode;
  /** Extra class on `home-shell` (e.g. `hub-tab-shell`, `c-calendar-shell`) */
  shellClassName?: string;
  canvasClassName?: string;
  /**
   * Split layout: fixed hero strip + flex workspace body (Agents, Runs, …).
   * Default: single scroll column like Home / Projects.
   */
  variant?: 'scroll' | 'split';
  /** Content below hero in split mode */
  body?: ReactNode;
}

export function EditorialShell({
  children,
  shellClassName = '',
  canvasClassName = '',
  variant = 'scroll',
  body,
}: EditorialShellProps) {
  const shellClass = ['home-shell', 'hub-editorial-shell', shellClassName].filter(Boolean).join(' ');

  if (variant === 'split') {
    return (
      <div className={shellClass}>
        <div className="hub-tab-hero-strip">
          <div className={`home-canvas ${canvasClassName}`.trim()}>{children}</div>
        </div>
        {body ? <div className="hub-workspace-body">{body}</div> : null}
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="home-scroll">
        <div className={`home-canvas ${canvasClassName}`.trim()}>{children}</div>
      </div>
    </div>
  );
}
