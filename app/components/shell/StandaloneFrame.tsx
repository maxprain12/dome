import type { ReactNode } from 'react';

/**
 * Frame for popout windows (frameless + hidden title bar). Provides:
 *  - a draggable top bar so the window can be moved
 *  - a safe zone clearing the macOS traffic lights (left) / Windows overlay (right)
 * Content renders below the bar and fills the rest of the window.
 */
export default function StandaloneFrame({ title, children }: { title: string; children: ReactNode }) {
  const isMac = typeof window !== 'undefined' && window.electron?.isMac;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <div
        className="flex shrink-0 items-center"
        style={{
          height: 40,
          background: 'var(--background)',
          borderBottom: '1px solid var(--border)',
          paddingLeft: isMac ? 80 : 12,
          paddingRight: isMac ? 12 : 140, // native window-controls overlay on Windows/Linux
          WebkitAppRegion: 'drag',
          zIndex: 10,
        } as React.CSSProperties}
      >
        <span className="text-sm font-medium truncate text-muted-foreground">
          {title}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
