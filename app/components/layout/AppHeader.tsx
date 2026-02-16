'use client';

import { useLocation } from 'react-router-dom';
import { Search, Settings } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import WindowControls from '@/components/ui/WindowControls';

const SECTION_TITLES: Record<string, string> = {
  library: 'Home',
  recent: 'Search',
  studio: 'Studio',
  flashcards: 'Flashcards',
  tags: 'Tags',
  chat: 'Martin Chat',
  projects: 'Projects',
};

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dome',
  '/settings': 'Settings',
  '/workspace': 'Workspace',
  '/workspace/note': 'Note',
  '/workspace/notebook': 'Notebook',
  '/workspace/url': 'URL',
  '/workspace/youtube': 'YouTube',
};

export default function AppHeader() {
  const location = useLocation();
  const homeSidebarSection = useAppStore((s) => s.homeSidebarSection);
  const setCommandCenterOpen = useAppStore((s) => s.setCommandCenterOpen);

  const isHome = location.pathname === '/';
  const title = isHome
    ? SECTION_TITLES[homeSidebarSection] ?? 'Home'
    : ROUTE_TITLES[location.pathname] ?? 'Dome';

  const isWindows = typeof window !== 'undefined' && window.electron?.isWindows;

  return (
    <div
      className={`fixed left-0 right-0 z-sticky flex items-center justify-between${isWindows ? ' win-titlebar-padding' : ''
        }`}
      style={{
        top: 0,
        paddingTop: 'var(--safe-area-inset-top)',
        height: 'var(--app-header-total)',
        minHeight: '44px',
        WebkitAppRegion: 'drag',
        background: 'var(--dome-surface)',
        borderBottom: '1px solid var(--dome-border)',
      } as React.CSSProperties}
    >
      {/* Left: traffic lights spacer on macOS + title */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-20 h-11 shrink-0" aria-hidden />
        <h1
          className="text-sm font-semibold truncate"
          style={{ color: 'var(--dome-text)' }}
        >
          {title}
        </h1>
      </div>

      {/* Right: actions + window controls */}
      <div
        className="flex items-center gap-1 pr-2 shrink-0 relative"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {isHome && (
          <button
            type="button"
            onClick={() => setCommandCenterOpen(true)}
            className="flex items-center justify-center rounded transition-colors min-w-[44px] min-h-[44px] w-11 h-11 border-none cursor-pointer hover:bg-[var(--dome-bg)] hover:text-[var(--dome-text)] text-[var(--dome-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            aria-label="Search"
            title="Search (Cmd+K)"
          >
            <Search className="w-4 h-4" strokeWidth={2} />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined' && window.electron?.openSettings) {
              window.electron.openSettings();
            }
          }}
          className="flex items-center justify-center rounded transition-colors min-w-[44px] min-h-[44px] w-11 h-11 border-none cursor-pointer hover:bg-[var(--dome-bg)] hover:text-[var(--dome-text)] text-[var(--dome-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="w-4 h-4" strokeWidth={2} />
        </button>
        <WindowControls />
      </div>
    </div>
  );
}
