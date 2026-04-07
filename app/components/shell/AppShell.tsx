import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Radio } from 'lucide-react';
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
import ManyVoiceBridge from '@/components/many/ManyVoiceBridge';
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
  const [manyVoiceActive, setManyVoiceActive] = useState(false);
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

  const handleToggleDictationDock = useCallback(async () => {
    try {
      await window.electron?.transcriptionOverlay?.toggleFromUi?.();
    } catch {
      /* ignore */
    }
  }, []);

  const handleToggleManyVoiceOverlay = useCallback(async () => {
    try {
      await window.electron?.manyVoice?.toggleOverlayFromUi?.();
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

  // Voice activity indicators — driven by DOM events from VoiceRecordingDock and ManyVoiceHud
  useEffect(() => {
    const dictOn = () => setDictationActive(true);
    const dictOff = () => setDictationActive(false);
    const voiceOn = () => setManyVoiceActive(true);
    const voiceOff = () => setManyVoiceActive(false);
    window.addEventListener('dome:dictation-started', dictOn);
    window.addEventListener('dome:dictation-stopped', dictOff);
    window.addEventListener('dome:many-voice-started', voiceOn);
    window.addEventListener('dome:many-voice-stopped', voiceOff);
    return () => {
      window.removeEventListener('dome:dictation-started', dictOn);
      window.removeEventListener('dome:dictation-stopped', dictOff);
      window.removeEventListener('dome:many-voice-started', voiceOn);
      window.removeEventListener('dome:many-voice-stopped', voiceOff);
    };
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
              <button
                type="button"
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

          {/* Voice: dictation dock + Many overlay (no global shortcut required) */}
          {/* Voice buttons with active-state indicators */}
          <div
            className="flex shrink-0 items-stretch gap-0.5 pr-1"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {/* Dictation dock button */}
            <button
              type="button"
              onClick={handleToggleDictationDock}
              className="relative flex items-center justify-center shrink-0 transition-colors rounded-md"
              style={{
                width: 34,
                height: '100%',
                background: dictationActive
                  ? 'color-mix(in srgb, var(--dome-accent) 12%, transparent)'
                  : 'transparent',
                color: dictationActive ? 'var(--dome-accent)' : 'var(--dome-text-muted)',
                border: 'none',
                cursor: 'pointer',
                transition: 'color 200ms ease, background 200ms ease',
              }}
              title={t('shell.dictation_dock')}
              aria-pressed={dictationActive}
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
            </button>

            {/* Many voice overlay button */}
            <button
              type="button"
              onClick={() => void handleToggleManyVoiceOverlay()}
              className="relative flex items-center justify-center shrink-0 transition-colors rounded-md"
              style={{
                width: 34,
                height: '100%',
                background: manyVoiceActive
                  ? 'color-mix(in srgb, var(--dome-accent) 12%, transparent)'
                  : 'transparent',
                color: manyVoiceActive ? 'var(--dome-accent)' : 'var(--dome-text-muted)',
                border: 'none',
                cursor: 'pointer',
                transition: 'color 200ms ease, background 200ms ease',
              }}
              title={t('shell.many_voice_overlay')}
              aria-pressed={manyVoiceActive}
            >
              <Radio className="h-[15px] w-[15px]" aria-hidden />
              {manyVoiceActive && (
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
            </button>
          </div>

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
