'use client';

import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Settings, Bell } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import { useCalendarStore } from '@/lib/store/useCalendarStore';
import WindowControls from '@/components/ui/WindowControls';

const SECTION_TITLES: Record<string, string> = {
  library: 'Home',
  studio: 'Studio',
  flashcards: 'Flashcards',
  tags: 'Tags',
  chat: 'Many Chat',
  projects: 'Projects',
  agents: 'Agentes',
};

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dome',
  '/calendar': 'Calendario',
  '/settings': 'Settings',
  '/workspace': 'Workspace',
  '/workspace/note': 'Note',
  '/workspace/notebook': 'Notebook',
  '/workspace/url': 'URL',
  '/workspace/youtube': 'YouTube',
  '/workspace/docx': 'Document',
};

function formatEventTime(ms: number) {
  const d = new Date(ms);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (eventDay.getTime() === today.getTime()) {
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('es', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const homeSidebarSection = useAppStore((s) => s.homeSidebarSection);
  const { upcomingEvents, upcomingUnreadCount, clearUpcomingUnread } = useCalendarStore();
  const isHome = location.pathname === '/';
  const title = isHome
    ? SECTION_TITLES[homeSidebarSection] ?? 'Home'
    : ROUTE_TITLES[location.pathname] ?? 'Dome';

  const isWindows = typeof window !== 'undefined' && window.electron?.isWindows;
  const badgeCount = upcomingUnreadCount;

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.calendar) return;
    const load = async () => {
      const result = await window.electron.calendar.getUpcoming({ windowMinutes: 60, limit: 10 });
      if (result.success && result.events) {
        useCalendarStore.getState().setUpcomingEvents(result.events);
      }
    };
    load();
    const unsub = window.electron.calendar.onUpcoming((data: { events?: unknown[] }) => {
      if (data?.events) useCalendarStore.getState().setUpcomingEvents(data.events);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    if (bellOpen) {
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }
  }, [bellOpen]);

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
        <div ref={bellRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setBellOpen((o) => !o);
              if (!bellOpen) clearUpcomingUnread();
            }}
            className="flex items-center justify-center rounded transition-colors min-w-[44px] min-h-[44px] w-11 h-11 border-none cursor-pointer hover:bg-[var(--dome-bg)] hover:text-[var(--dome-text)] text-[var(--dome-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            aria-label="Eventos próximos"
            title="Eventos próximos"
          >
            <Bell className="w-4 h-4" strokeWidth={2} />
            {badgeCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ background: 'var(--dome-error)', color: 'white' }}
              >
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}
          </button>
          {bellOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-80 rounded-lg shadow-lg border overflow-hidden z-50"
              style={{
                background: 'var(--dome-surface)',
                borderColor: 'var(--dome-border)',
              }}
            >
              <div className="p-2 border-b" style={{ borderColor: 'var(--dome-border)' }}>
                <span className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                  Eventos próximos
                </span>
              </div>
              <div className="max-h-64 overflow-auto">
                {upcomingEvents.length === 0 ? (
                  <div className="p-4 text-center text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                    No hay eventos próximos
                  </div>
                ) : (
                  upcomingEvents.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => {
                        setBellOpen(false);
                        navigate('/calendar');
                      }}
                      className="w-full text-left p-3 hover:bg-[var(--dome-bg)] border-b last:border-b-0 transition-colors"
                      style={{ borderColor: 'var(--dome-border)' }}
                    >
                      <div className="font-medium truncate" style={{ color: 'var(--dome-text)' }}>
                        {ev.title}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                        {formatEventTime(ev.start_at)}
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="p-2 border-t" style={{ borderColor: 'var(--dome-border)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setBellOpen(false);
                    navigate('/calendar');
                  }}
                  className="text-sm font-medium w-full text-center py-1.5 rounded hover:bg-[var(--dome-bg)]"
                  style={{ color: 'var(--dome-accent)' }}
                >
                  Ver calendario
                </button>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          data-tour="settings"
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
