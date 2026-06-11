import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import DomeTabBar from './DomeTabBar';
import ContentRouter from './ContentRouter';
import { useManyStore } from '@/lib/store/useManyStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { useResizeStore } from '@/lib/store/useResizeStore';
import UnifiedSidebar from '@/components/workspace/UnifiedSidebar';
import PetPluginSlot from '@/components/plugins/PetPluginSlot';
import ResizeHandle from '@/components/workspace/ResizeHandle';
import WindowControls from '@/components/ui/WindowControls';
import DomeButton from '@/components/ui/DomeButton';
import ManyVoiceBridge from '@/components/many/ManyVoiceBridge';
import SystemErrorNotifier from '@/components/shell/SystemErrorNotifier';
import TranscriptionPill from '@/components/transcription/TranscriptionPill';
import { useTranscriptionStore } from '@/lib/transcription/useTranscriptionStore';
import ApprovalProvider from '@/components/approval/ApprovalProvider';
import { installDomeUiActionBridge } from '@/lib/shell/domeUiActionBridge';

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

// Eagerly start the import at module level so it's already resolving before
// AppShell renders. Using useState+useEffect instead of React.lazy()+Suspense
// prevents React 18's concurrent scheduler from deferring the Suspense resolution
// during the initial render burst (which caused the right panel to stay on its
// "Loading..." fallback until the user clicked something).
import { loadManyPanelModule } from '@/components/many/manyPanelModule';

void loadManyPanelModule();

interface ManyPanelWithSuspenseProps {
  width: number;
  onClose: () => void;
  isVisible: boolean;
  isFullscreen?: boolean;
  mode?: 'full' | 'headless';
}

function ManyPanelWithSuspense(props: ManyPanelWithSuspenseProps) {
  const { t } = useTranslation();
  const [ManyPanelComp, setManyPanelComp] = useState<React.ComponentType<ManyPanelWithSuspenseProps> | null>(null);

  useEffect(() => {
    void loadManyPanelModule().then((m) => {
      setManyPanelComp(() => m.default);
    });
  }, []);

  if (!ManyPanelComp) {
    return (
      <div className="flex flex-1 items-center justify-center h-full min-h-[80px]" style={{ background: 'var(--dome-bg)' }}>
        <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{t('common.loading')}</span>
      </div>
    );
  }

  return <ManyPanelComp {...props} />;
}

export default function AppShell() {
  const { t } = useTranslation();
  const [manyWidth, setManyWidth] = useState(MANY_DEFAULT);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  /** Muestra Many en la columna derecha aunque la pestaña activa sea Chat (p. ej. HITL). */
  const [manyRightOverride, setManyRightOverride] = useState(false);

  const manyWidthRef = useRef(manyWidth);
  manyWidthRef.current = manyWidth;

  const openChatTab = useTabStore((s) => s.openChatTab);
  const { activeTabId, tabs } = useTabStore(
    useShallow((s) => ({ activeTabId: s.activeTabId, tabs: s.tabs })),
  );
  const leftSidebarCollapsed = useResizeStore((s) => s.leftSidebarCollapsed);
  const toggleLeftSidebar = useResizeStore((s) => s.toggleLeftSidebar);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isChatTab = activeTab?.type === 'chat';

  const isMac = typeof window !== 'undefined' && window.electron?.isMac;
  const isWindows = typeof window !== 'undefined' && window.electron?.isWindows;
  const isLinux = typeof window !== 'undefined' && window.electron?.isLinux;
  /** Windows overlay + controles dibujados en Linux (no usar titleBarOverlay de Win). */
  const needsRightTitleInset = Boolean(isWindows || isLinux);

  useEffect(() => {
    setManyWidth(readInt(MANY_WIDTH_KEY, MANY_DEFAULT, MANY_MIN, MANY_MAX));
  }, []);

  /** agent ui_* actions — exactly one ipcRenderer listener app-wide */
  useEffect(() => {
    const off = installDomeUiActionBridge();
    return off;
  }, []);

  // Transcription: subscribe once to the main-process broadcast and prime settings.
  useEffect(() => {
    const tx = window.electron?.transcription;
    if (!tx) return undefined;
    void useTranscriptionStore.getState().loadSettings();
    const off = tx.onState(useTranscriptionStore.getState()._onStateBroadcast);
    return () => off?.();
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

  // Auto-open the right Many panel when leaving chat; chat fullscreen keeps historial inside Many.
  const prevActiveTabIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevActiveTabIdRef.current;
    prevActiveTabIdRef.current = activeTabId ?? null;
    if (prev === activeTabId) return;
    if (isChatTab) {
      setRightSidebarOpen(false);
      return;
    }
    if (!rightSidebarOpen) {
      setRightSidebarOpen(true);
    }
  }, [activeTabId, isChatTab, rightSidebarOpen]);

  useEffect(() => {
    const onReq = () => {
      const { tabs: tabList, activeTabId: aid } = useTabStore.getState();
      const tab = tabList.find((x) => x.id === aid);
      if (tab?.type === 'chat') return;
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

  /** Notes editor ⌘J / sparkle actions: reopen Many in the shell right column */
  useEffect(() => {
    const onOpenManySidebar = () => {
      const { tabs: tabList, activeTabId: aid } = useTabStore.getState();
      const tab = tabList.find((x) => x.id === aid);
      if (tab?.type === 'chat') {
        setManyRightOverride(true);
      }
      setRightSidebarOpen(true);
    };
    window.addEventListener('dome:many-sidebar-open', onOpenManySidebar);
    return () => window.removeEventListener('dome:many-sidebar-open', onOpenManySidebar);
  }, []);

  const isChatCenterLayout = Boolean(isChatTab && !manyRightOverride);
  const showManyInSidebar = Boolean(rightSidebarOpen && (!isChatTab || manyRightOverride));
  const needsHeadlessMany = isChatCenterLayout;

  const SIDEBAR_W = 260;
  /** Hueco mínimo para arrastrar la ventana entre pestañas y controles derechos. */
  const HEADER_DRAG_GAP_MIN_PX = 28;


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
            // Hueco derecho para titleBarOverlay (Win) / WindowControls absolutos (Linux)
            paddingRight: needsRightTitleInset ? 140 : 0,
          } as React.CSSProperties}
        >
          <div
            className="flex flex-1 min-w-0 min-h-0 items-stretch"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <DomeTabBar onNewChat={handleNewChat} />
          </div>

          {/* Heredero de drag del padre: NO puede estar dentro del wrapper no-drag de DomeTabBar (rompe clics en tabs en Electron). */}
          <div
            aria-hidden
            className="shrink-0 self-stretch select-none"
            style={{
              flex: '0 1 48px',
              minWidth: HEADER_DRAG_GAP_MIN_PX,
              maxWidth: 96,
              WebkitAppRegion: 'drag',
            } as React.CSSProperties}
          />

          {/* Transcription pill — single entry point for recording */}
          <div
            className="flex shrink-0 items-stretch gap-0.5 pr-1"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <TranscriptionPill />
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
      <div className="dome-app-body flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar */}
        {!leftSidebarCollapsed && (
          <UnifiedSidebar collapsed={false} onCollapse={toggleLeftSidebar} />
        )}

        {/* Main content */}
        <main
          className="dome-main-content flex flex-col flex-1 min-w-0 overflow-hidden"
          style={{ background: 'var(--dome-surface)' }}
        >
          <ContentRouter />
        </main>

        {/* Right sidebar: Many en modo panel (no en pestaña Chat fullscreen — historial va dentro de Many). */}
        {showManyInSidebar ? (
          <>
            <ResizeHandle onResize={handleManyResize} direction="horizontal" />
            <div
              className="dome-right-panel shrink-0 overflow-hidden"
              style={{
                width: manyWidth,
                minWidth: manyWidth,
                transition: 'width 200ms ease',
              }}
            >
              <ManyPanelWithSuspense
                width={manyWidth}
                onClose={handleToggleRightSidebar}
                isVisible
                isFullscreen={false}
              />
            </div>
          </>
        ) : null}

        {needsHeadlessMany && (
          <div
            aria-hidden
            className="fixed top-0 left-0 size-px overflow-hidden opacity-0 pointer-events-none"
            style={{ zIndex: -10 }}
          >
            <div style={{ width: manyWidth, minHeight: 1 }}>
              <ManyPanelWithSuspense
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
      <SystemErrorNotifier />

      {/* In-app HITL approval modals */}
      <ApprovalProvider />
    </div>
  );
}
