import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic } from 'lucide-react';
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
import DomeButton from '@/components/ui/DomeButton';
import ManyVoiceBridge from '@/components/many/ManyVoiceBridge';
import { useFeatureFlagEnabled } from '@/lib/analytics/useFeatureFlag';
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
  /** Muestra Many en la columna derecha aunque la pestaña activa sea Chat (p. ej. HITL). */
  const [manyRightOverride, setManyRightOverride] = useState(false);

  // ── Voice overlay active indicators ──────────────────
  const [dictationActive, setDictationActive] = useState(false);
  const manyWidthRef = useRef(manyWidth);
  manyWidthRef.current = manyWidth;

  const { openChatTab, activeTabId, tabs, openTranscriptionsTab } = useTabStore();
  const callsV2 = useFeatureFlagEnabled('dome-calls-v2');
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

  const handleToggleDictationDock = useCallback(async () => {
    try {
      await window.electron?.transcriptionOverlay?.toggleFromUi?.();
    } catch {
      /* ignore */
    }
  }, []);

  const handleNewChat = useCallback(() => {
    useManyStore.getState().startNewChat();
    const sessionId = useManyStore.getState().currentSessionId;
    if (sessionId) openChatTab(sessionId, t('shell.new_chat'));
    if (!rightSidebarOpen) setRightSidebarOpen(true);
  }, [openChatTab, rightSidebarOpen, t]);

  /** ⌘K enfoca el buscador del Inicio (si el widget de búsqueda está visible). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        const { tabs: tabList, activeTabId: aid } = useTabStore.getState();
        const tab = tabList.find((x) => x.id === aid);
        if (tab?.type !== 'home') return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('dome:focus-inline-search'));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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

  useEffect(() => {
    const onReq = () => {
      setManyRightOverride(true);
      setRightSidebarOpen(true);
    };
    const onClr = () => setManyRightOverride(false);
    window.addEventListener('dome:many-requires-panel', onReq);
    window.addEventListener('dome:many-hitl-cleared', onClr);
    return () => {
      window.removeEventListener('dome:many-requires-panel', onReq);
      window.removeEventListener('dome:many-hitl-cleared', onClr);
    };
  }, []);

  // Hub activity indicator — broadcast from transcription overlay via main process
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return undefined;
    const unsub = window.electron.on(
      'transcription:state',
      (payload: unknown) => {
        if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
          setDictationActive(false);
          return;
        }
        const ph = (payload as { phase?: string }).phase;
        const busy = ph === 'recording' || ph === 'paused' || ph === 'processing';
        setDictationActive(Boolean(busy));
      },
    );
    return () => unsub?.();
  }, []);

  const showChatHistory = Boolean(isChatTab && !manyRightOverride);
  const showManyInSidebar = Boolean(rightSidebarOpen && !showChatHistory);
  const needsHeadlessMany = !showManyInSidebar;

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
        {/* Left section: alineado al ancho del sidebar; arrastrable salvo el botón de colapsar */}
        <div
          className="flex items-center shrink-0 min-w-0"
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
          <div className="flex flex-1 min-w-0 items-center justify-end gap-1.5 h-full">
            {/* Hueco arrastrable (mover ventana); la marca Dome está en el sidebar */}
            <div className="flex-1 min-w-0 h-full self-stretch" aria-hidden />
            <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <DomeButton
                type="button"
                variant="ghost"
                size="sm"
                iconOnly
                onClick={toggleLeftSidebar}
                className="!p-1 w-[22px] h-[22px] min-w-0 text-[var(--dome-text-muted)] hover:text-[var(--dome-text)]"
                title={leftSidebarCollapsed ? t('shell.open_sidebar') : t('shell.close_sidebar')}
                aria-label={leftSidebarCollapsed ? t('shell.open_sidebar') : t('shell.close_sidebar')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </DomeButton>
            </div>
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

          {/* Voice: transcription hub overlay (STT → notes) */}
          <div
            className="flex shrink-0 items-stretch gap-0.5 pr-1"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <DomeButton
              type="button"
              variant="ghost"
              size="sm"
              iconOnly
              onClick={handleToggleDictationDock}
              onContextMenu={(e) => {
                if (!callsV2) return;
                e.preventDefault();
                openTranscriptionsTab();
              }}
              className="relative !rounded-md w-[34px] h-full min-h-0 shrink-0 px-0 transition-colors"
              title={
                callsV2
                  ? `${t('shell.dictation_dock')} · ${t('shell.open_transcriptions')}`
                  : t('shell.dictation_dock')
              }
              style={{
                background: dictationActive
                  ? 'color-mix(in srgb, var(--dome-accent) 12%, transparent)'
                  : undefined,
                color: dictationActive ? 'var(--dome-accent)' : 'var(--dome-text-muted)',
              }}
              aria-pressed={dictationActive}
              aria-label={t('shell.dictation_dock')}
            >
              <Mic className="h-[15px] w-[15px]" aria-hidden />
              {dictationActive && (
                <span
                  className="absolute top-[6px] right-[6px] rounded-full"
                  style={{
                    width: 5, height: 5,
                    background: 'var(--dome-accent)',
                    animation: 'pulse-dot 1.4s ease-in-out infinite',
                  }}
                  aria-hidden
                />
              )}
            </DomeButton>
          </div>

          {/* Right sidebar toggle */}
          <div
            className="flex shrink-0 items-stretch"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <DomeButton
              type="button"
              variant="ghost"
              size="sm"
              iconOnly
              onClick={handleToggleRightSidebar}
              className="!rounded-none w-9 h-full min-h-0 shrink-0 rounded-none border-0 border-l border-solid border-[var(--dome-border)] !px-0"
              style={{
                color: rightSidebarOpen ? 'var(--dome-text)' : 'var(--dome-text-muted)',
              }}
              title={rightSidebarOpen ? t('shell.close_right_panel') : t('shell.open_right_panel')}
              aria-label={rightSidebarOpen ? t('shell.close_right_panel') : t('shell.open_right_panel')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
            </DomeButton>
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
            {showManyInSidebar ? <ResizeHandle onResize={handleManyResize} direction="horizontal" /> : null}
            <div
              className="shrink-0 overflow-hidden"
              style={{
                width: showChatHistory ? 280 : manyWidth,
                minWidth: showChatHistory ? 280 : manyWidth,
                transition: 'width 200ms ease',
              }}
            >
              {showChatHistory ? (
                <ChatHistoryPanel onClose={handleToggleRightSidebar} />
              ) : (
                <ManyPanel
                  width={manyWidth}
                  onClose={handleToggleRightSidebar}
                  isVisible
                  isFullscreen={false}
                />
              )}
            </div>
          </>
        )}

        {needsHeadlessMany && (
          <div
            aria-hidden
            className="fixed top-0 left-0 w-px h-px overflow-hidden opacity-0 pointer-events-none"
            style={{ zIndex: -10 }}
          >
            <div style={{ width: manyWidth, minHeight: 1 }}>
              <ManyPanel
                width={manyWidth}
                onClose={() => {}}
                isVisible
                isFullscreen={false}
                mode="headless"
              />
            </div>
          </div>
        )}
      </div>

      {/* Pet mascot overlay */}
      <PetPluginSlot />

      {/* Voice IPC bridge — always mounted, zero UI */}
      <ManyVoiceBridge />
    </div>
  );
}
