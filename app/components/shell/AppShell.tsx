import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import DomeTabBar from './DomeTabBar';
import ContentRouter from './ContentRouter';
import ManyPanel from '@/components/many/ManyPanel';
import ChatHistoryPanel from '@/components/chat/ChatHistoryPanel';
import { useManyStore } from '@/lib/store/useManyStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { useResizeStore } from '@/lib/store/useResizeStore';
import UnifiedSidebar from '@/components/workspace/UnifiedSidebar';
import PetPluginSlot from '@/components/plugins/PetPluginSlot';
import ResizeHandle from '@/components/workspace/ResizeHandle';
import WindowControls from '@/components/ui/WindowControls';

const MANY_WIDTH_KEY = 'dome:many-panel-width-v1';
const MANY_MIN = 280;
const MANY_MAX = 600;
const MANY_DEFAULT = 380;

function readInt(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const n = parseInt(raw, 10);
      if (!Number.isNaN(n) && n >= min && n <= max) return n;
    }
  } catch { /* ignore */ }
  return fallback;
}

export default function AppShell() {
  const { t } = useTranslation();
  const [manyWidth, setManyWidth] = useState(MANY_DEFAULT);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const manyWidthRef = useRef(manyWidth);
  manyWidthRef.current = manyWidth;

  const { openChatTab, activeTabId, tabs } = useTabStore();
  const { leftSidebarCollapsed, toggleLeftSidebar } = useResizeStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isChatTab = activeTab?.type === 'chat';

  const isMac = typeof window !== 'undefined' && window.electron?.isMac;
  const isWindows = typeof window !== 'undefined' && window.electron?.isWindows;

  useEffect(() => {
    setManyWidth(readInt(MANY_WIDTH_KEY, MANY_DEFAULT, MANY_MIN, MANY_MAX));
  }, []);

  const handleManyResize = useCallback((deltaX: number) => {
    // Panel is on the right: dragging handle left (negative deltaX) expands it
    const newWidth = manyWidthRef.current - deltaX;
    if (newWidth >= MANY_MIN && newWidth <= MANY_MAX) {
      setManyWidth(newWidth);
    }
  }, []);

  const handleToggleRightSidebar = useCallback(() => {
    setRightSidebarOpen(prev => !prev);
  }, []);

  const handleNewChat = useCallback(() => {
    useManyStore.getState().startNewChat();
    const sessionId = useManyStore.getState().currentSessionId;
    if (sessionId) openChatTab(sessionId, t('shell.new_chat'));
    if (!rightSidebarOpen) setRightSidebarOpen(true);
  }, [openChatTab, rightSidebarOpen, t]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;
    const unsub = window.electron.on('dome:open-resource-in-tab', (data: { resourceId: string; resourceType: string; title: string }) => {
      useTabStore.getState().openResourceTab(data.resourceId, data.resourceType, data.title || t('app.resource'));
    });
    return () => unsub?.();
  }, [t]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;
    const unsub = window.electron.on('dome:open-settings-in-tab', () => {
      useTabStore.getState().openSettingsTab();
    });
    return () => unsub?.();
  }, []);

  // Close any open tab whose resource was deleted
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;
    const unsub = window.electron.on('resource:deleted', ({ id }: { id: string }) => {
      const { tabs, closeTab } = useTabStore.getState();
      tabs.forEach((tab) => {
        if (tab.resourceId === id) closeTab(tab.id);
      });
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (isChatTab && !rightSidebarOpen) {
      setRightSidebarOpen(true);
    }
  }, [isChatTab]);

  const effectiveManyWidth = rightSidebarOpen ? manyWidth : 0;

  const SIDEBAR_W = 260;
  const HEADER_DRAG_STRIP_W = isWindows ? 20 : 32;

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--dome-bg)' }}>

      {/* ── Unified top bar (full window width) ── */}
      <div
        className="flex shrink-0 items-stretch relative"
        style={{
          height: 40,
          background: 'var(--dome-bg)',
          borderBottom: '1px solid var(--dome-border)',
          WebkitAppRegion: 'drag',
          zIndex: 10,
        } as React.CSSProperties}
      >
        {/* Left section: sidebar header */}
        <div
          className="flex items-center shrink-0"
          style={{
            width: leftSidebarCollapsed ? (isMac ? 116 : 48) : SIDEBAR_W,
            minWidth: leftSidebarCollapsed ? (isMac ? 116 : 48) : SIDEBAR_W,
            paddingLeft: isMac ? 80 : 8,
            paddingRight: 8,
            borderRight: '1px solid var(--dome-border)',
            transition: 'width 200ms ease, min-width 200ms ease',
            overflow: 'hidden',
          } as React.CSSProperties}
        >
          {/* no-drag wrapper so buttons remain clickable */}
          <div
            className="flex items-center gap-1.5 flex-1 min-w-0"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {!leftSidebarCollapsed && (
              <>
                <div className="w-4 h-4 shrink-0" style={{ filter: 'var(--dome-logo-filter)' }}>
                  <img src="/many.png" alt="Dome" width={16} height={16} style={{ objectFit: 'contain' }} />
                </div>
                <span
                  className="truncate flex-1"
                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--dome-text)', userSelect: 'none' }}
                >
                  Dome
                </span>
              </>
            )}
            {/* Sidebar toggle — always visible in header */}
            <button
              onClick={toggleLeftSidebar}
              className="flex items-center justify-center rounded shrink-0 transition-colors"
              style={{
                width: 22, height: 22,
                background: 'transparent',
                color: 'var(--dome-text-muted)',
                border: 'none',
                cursor: 'pointer',
              }}
              title={leftSidebarCollapsed ? t('shell.open_sidebar') : t('shell.close_sidebar')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
          </div>
        </div>

        {/* Right section: tab bar + right panel toggle */}
        <div
          className="flex flex-1 min-w-0 items-stretch"
          style={{
            paddingLeft: 6,
            // leave room for Windows titleBarOverlay controls (~138px on right)
            paddingRight: isWindows ? 138 : 0,
          } as React.CSSProperties}
        >
          <div
            className="flex flex-1 min-w-0 items-stretch"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <DomeTabBar onNewChat={handleNewChat} />
          </div>

          <div
            aria-hidden="true"
            className="shrink-0"
            style={{
              width: HEADER_DRAG_STRIP_W,
              WebkitAppRegion: 'drag',
            } as React.CSSProperties}
          />

          {/* Right sidebar toggle */}
          <div
            className="flex shrink-0 items-stretch"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <button
              onClick={handleToggleRightSidebar}
              className="flex items-center justify-center shrink-0 transition-colors"
              style={{
                width: 36, height: '100%',
                background: 'transparent',
                color: rightSidebarOpen ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                border: 'none',
                borderLeft: '1px solid var(--dome-border)',
                cursor: 'pointer',
              }}
              title={rightSidebarOpen ? t('shell.close_right_panel') : t('shell.open_right_panel')}
            >
              {/* Panel-right icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
            </button>
          </div>
        </div>

        {/* Linux window controls (no-op on Mac/Windows) */}
        <WindowControls />
      </div>

      {/* ── Body row ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar */}
        {!leftSidebarCollapsed && (
          <UnifiedSidebar collapsed={false} onCollapse={toggleLeftSidebar} />
        )}

        {/* Main content */}
        <main
          className="flex flex-col flex-1 min-w-0 overflow-hidden"
          style={{ background: 'var(--dome-surface)' }}
        >
          <div className="flex flex-1 min-h-0 overflow-hidden relative">
            <ContentRouter />
          </div>
        </main>

        {/* Right sidebar with resize handle */}
        {rightSidebarOpen && (
          <>
            {!isChatTab && <ResizeHandle onResize={handleManyResize} direction="horizontal" />}
            <div
              className="shrink-0 overflow-hidden"
              style={{
                width: isChatTab ? 280 : effectiveManyWidth,
                minWidth: isChatTab ? 280 : effectiveManyWidth,
                transition: 'width 200ms ease',
              }}
            >
              {isChatTab ? (
                <ChatHistoryPanel onClose={handleToggleRightSidebar} />
              ) : (
                <ManyPanel
                  width={manyWidth}
                  onClose={handleToggleRightSidebar}
                  isVisible={true}
                  isFullscreen={false}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Pet mascot overlay */}
      <PetPluginSlot />
    </div>
  );
}
