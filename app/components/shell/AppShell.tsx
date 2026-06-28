import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import DomeTabBar from './DomeTabBar';
import ContentRouter from './ContentRouter';
import { useManyStore } from '@/lib/store/useManyStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useResizeStore } from '@/lib/store/useResizeStore';
import UnifiedSidebar from '@/components/workspace/UnifiedSidebar';
import PetPluginSlot from '@/components/plugins/PetPluginSlot';
import ResizeHandle from '@/components/workspace/ResizeHandle';
import WindowControls from '@/components/ui/WindowControls';
import ManyVoiceBridge from '@/components/many/ManyVoiceBridge';
import SystemErrorNotifier from '@/components/shell/SystemErrorNotifier';
import TranscriptionPill from '@/components/transcription/TranscriptionPill';
import { useTranscriptionStore } from '@/lib/transcription/useTranscriptionStore';
import ApprovalProvider from '@/components/approval/ApprovalProvider';
import CommandPalette from '@/components/search/CommandPalette';
import { installDomeUiActionBridge } from '@/lib/shell/domeUiActionBridge';
import {
  LAYOUT_DEFAULTS,
  LAYOUT_RESET_EVENT,
  MANY_PANEL_WIDTH_KEY,
} from '@/lib/shell/layoutReset';

const MANY_WIDTH_KEY = MANY_PANEL_WIDTH_KEY;
const MANY_MIN = 280;
const MANY_MAX = 600;
const MANY_DEFAULT = LAYOUT_DEFAULTS.manyPanelWidth;

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
  const [manyWidth, setManyWidth] = useState<number>(MANY_DEFAULT);
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

  const isElectron = typeof window !== 'undefined' && Boolean(window.electron);
  const isMac = isElectron && window.electron!.isMac;
  const isWindows = isElectron && window.electron!.isWindows;
  const isLinux = isElectron && window.electron!.isLinux;
  /** Windows overlay + controles dibujados en Linux (no usar titleBarOverlay de Win). */
  const needsRightTitleInset = Boolean(isWindows || isLinux);

  useEffect(() => {
    setManyWidth(readInt(MANY_WIDTH_KEY, MANY_DEFAULT, MANY_MIN, MANY_MAX));
  }, []);

  useEffect(() => {
    const onLayoutReset = () => {
      setManyWidth(MANY_DEFAULT);
      useResizeStore.setState({
        leftSidebarWidth: LAYOUT_DEFAULTS.leftSidebarWidth,
        rightSidebarWidth: LAYOUT_DEFAULTS.rightSidebarWidth,
        chatSidebarWidth: LAYOUT_DEFAULTS.chatSidebarWidth,
        leftSidebarCollapsed: false,
        rightSidebarCollapsed: true,
        chatSidebarCollapsed: false,
      });
    };
    window.addEventListener(LAYOUT_RESET_EVENT, onLayoutReset);
    return () => window.removeEventListener(LAYOUT_RESET_EVENT, onLayoutReset);
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

  // Project switch: close every project-scoped tab from the previous project
  // so documents generated in one project do not leak into the tab bar of
  // another. Global tabs (home, settings, calendar, chat, …) are preserved.
  const currentProjectId = useAppStore((s) => s.currentProject?.id ?? null);
  useEffect(() => {
    if (currentProjectId == null) return;
    // Enforce isolation: only the active project's document tabs stay open.
    // Runs on mount and on every switch, so tabs from another vault (including
    // ones reached via cross-project navigation) never linger.
    useTabStore.getState().closeForeignProjectTabs(currentProjectId);
  }, [currentProjectId]);

  // Auto-open the right Many panel when leaving chat; chat fullscreen keeps historial inside Many.
  const [prevActiveTabId, setPrevActiveTabId] = useState(activeTabId ?? null);
  if ((activeTabId ?? null) !== prevActiveTabId) {
    setPrevActiveTabId(activeTabId ?? null);
    if (isChatTab) {
      setRightSidebarOpen(false);
    } else if (!rightSidebarOpen) {
      setRightSidebarOpen(true);
    }
  }

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

  const showManyInSidebar = Boolean(rightSidebarOpen && (!isChatTab || manyRightOverride));

  const headerPlatform = !isElectron
    ? 'web'
    : isMac
      ? 'mac'
      : isWindows
        ? 'win'
        : 'linux';

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      data-platform={headerPlatform}
      data-sidebar-collapsed={leftSidebarCollapsed ? 'true' : 'false'}
      style={{ background: 'var(--dome-bg)' }}
    >

      {/* ── Unified top bar (CSS grid: left chrome | tabs | actions) ── */}
      <header
        className="dome-shell-header shrink-0"
        data-platform={headerPlatform}
        data-sidebar-collapsed={leftSidebarCollapsed ? 'true' : 'false'}
        data-many-panel-open={showManyInSidebar ? 'true' : 'false'}
      >
        <div className="dome-shell-header-left" aria-hidden="true" />

        <button
          type="button"
          className="dome-chrome-icon-btn dome-chrome-icon-btn--strip-edge dome-shell-sidebar-toggle"
          data-active={!leftSidebarCollapsed ? 'true' : 'false'}
          onClick={toggleLeftSidebar}
          title={leftSidebarCollapsed ? t('shell.open_sidebar') : t('shell.close_sidebar')}
          aria-label={leftSidebarCollapsed ? t('shell.open_sidebar') : t('shell.close_sidebar')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>

        <div className="dome-shell-header-tabs">
          <DomeTabBar onNewChat={handleNewChat} />

          <button
            type="button"
            className="dome-chrome-icon-btn dome-chrome-icon-btn--strip-edge"
            data-active={rightSidebarOpen ? 'true' : 'false'}
            onClick={handleToggleRightSidebar}
            title={rightSidebarOpen ? t('shell.close_right_panel') : t('shell.open_right_panel')}
            aria-label={rightSidebarOpen ? t('shell.close_right_panel') : t('shell.open_right_panel')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>
        </div>

        <div className="dome-shell-header-actions">
          <div className="dome-header-drag-zone" aria-hidden />

          <div className="dome-header-actions-inner no-drag">
            <TranscriptionPill />
          </div>

          {needsRightTitleInset ? <div className="dome-titlebar-inset-spacer" aria-hidden /> : null}
        </div>

        <WindowControls />
      </header>

      {/* ── Body row ── */}
      <div className="dome-app-body flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar */}
        <UnifiedSidebar collapsed={leftSidebarCollapsed} onCollapse={toggleLeftSidebar} />

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

      </div>

      {/* Pet mascot overlay */}
      <PetPluginSlot />

      {/* Voice IPC bridge — always mounted, zero UI */}
      <ManyVoiceBridge />
      <SystemErrorNotifier />

      {/* In-app HITL approval modals */}
      <ApprovalProvider />

      {/* Global Spotlight-style command palette (⌘K / Ctrl+K) */}
      <CommandPalette />
    </div>
  );
}
