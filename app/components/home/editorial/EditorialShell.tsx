import type { ReactNode } from 'react';

export interface EditorialShellProps {
  children: ReactNode;
  /** Extra class on `home-shell` (e.g. `hub-tab-shell`) */
  shellClassName?: string;
  canvasClassName?: string;
  /**
   * Split layout: fixed hero strip + flex workspace body (Agents, Runs, …).
   * Default: single scroll column like Home / Projects.
   */
  variant?: 'scroll' | 'split';
  /** Content below hero in split mode */
  body?: ReactNode;
  /** Extra class on hub-workspace-body (e.g. hub-workspace-body--detail) */
  bodyClassName?: string;
}

export function EditorialShell({
  children,
  shellClassName = '',
  canvasClassName = '',
  variant = 'scroll',
  body,
  bodyClassName = '',
}: EditorialShellProps) {
  const shellClass = ['home-shell', 'hub-editorial-shell', shellClassName].filter(Boolean).join(' ');

  if (variant === 'split') {
    return (
      <div className={shellClass}>
        <div className="hub-tab-hero-strip">
          <div className={`home-canvas ${canvasClassName}`.trim()}>{children}</div>
        </div>
        {body ? (
          <div className={['hub-workspace-body', bodyClassName].filter(Boolean).join(' ')}>{body}</div>
        ) : null}
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
