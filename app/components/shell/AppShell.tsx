import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePanelRef } from 'react-resizable-panels';
import { useShallow } from 'zustand/react/shallow';
import TitleBar from './TitleBar';
import ContentRouter from './ContentRouter';
import { useManyStore } from '@/lib/store/useManyStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useResizeStore } from '@/lib/store/useResizeStore';
import UnifiedSidebar from '@/components/workspace/UnifiedSidebar';
import SettingsNav from '@/components/settings/SettingsNav';
import PetPluginSlot from '@/components/plugins/PetPluginSlot';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import ManyVoiceBridge from '@/components/many/ManyVoiceBridge';
import SystemErrorNotifier from '@/components/shell/SystemErrorNotifier';
import { useTranscriptionStore } from '@/lib/transcription/useTranscriptionStore';
import ApprovalProvider from '@/components/approval/ApprovalProvider';
import CommandPalette from '@/components/search/CommandPalette';
import { installDomeUiActionBridge } from '@/lib/shell/domeUiActionBridge';
import {
  LAYOUT_DEFAULTS,
  LAYOUT_RESET_EVENT,
  MANY_PANEL_OPEN_KEY,
  MANY_PANEL_WIDTH_KEY,
} from '@/lib/shell/layoutReset';
import { useSyncManyActiveResourceContext } from '@/lib/many/useSyncManyActiveResourceContext';
import { cn } from '@/lib/utils';

const MANY_WIDTH_KEY = MANY_PANEL_WIDTH_KEY;
const MANY_MIN = 280;
const MANY_MAX = 600;
const MANY_DEFAULT = LAYOUT_DEFAULTS.manyPanelWidth;

function readManyPanelOpen(fallback = true): boolean {
  try {
    const raw = localStorage.getItem(MANY_PANEL_OPEN_KEY);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch { /* ignore */ }
  return fallback;
}

function persistManyPanelOpen(open: boolean): void {
  try {
    localStorage.setItem(MANY_PANEL_OPEN_KEY, open ? '1' : '0');
  } catch { /* ignore */ }
}

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

function useNarrowShell(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return narrow;
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
      <div className="flex flex-1 items-center justify-center h-full min-h-[80px] bg-background">
        <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
      </div>
    );
  }

  return <ManyPanelComp {...props} />;
}

export default function AppShell() {
  const { t } = useTranslation();
  const [manyWidth, setManyWidth] = useState<number>(MANY_DEFAULT);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(() => readManyPanelOpen());
  /** Muestra Many en la columna derecha aunque la pestaña activa sea Chat (p. ej. HITL). */
  const [manyRightOverride, setManyRightOverride] = useState(false);
  const narrowShell = useNarrowShell();
  const manyPanelRef = usePanelRef();

  const openChatTab = useTabStore((s) => s.openChatTab);
  const { activeTabId, tabs } = useTabStore(
    useShallow((s) => ({ activeTabId: s.activeTabId, tabs: s.tabs })),
  );
  const leftSidebarCollapsed = useResizeStore((s) => s.leftSidebarCollapsed);
  const toggleLeftSidebar = useResizeStore((s) => s.toggleLeftSidebar);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isChatTab = activeTab?.type === 'chat';
  const isSettingsTab = activeTab?.type === 'settings';

  useSyncManyActiveResourceContext();

  // Settings mode replaces UnifiedSidebar with SettingsNav — keep the left
  // rail open so section navigation is immediately usable.
  useEffect(() => {
    if (!isSettingsTab) return;
    if (useResizeStore.getState().leftSidebarCollapsed) {
      useResizeStore.setState({ leftSidebarCollapsed: false });
    }
  }, [isSettingsTab]);

  useEffect(() => {
    setManyWidth(readInt(MANY_WIDTH_KEY, MANY_DEFAULT, MANY_MIN, MANY_MAX));
  }, []);

  useEffect(() => {
    const onLayoutReset = () => {
      setManyWidth(MANY_DEFAULT);
      setRightSidebarOpen(true);
      persistManyPanelOpen(true);
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

  const handleManyResize = useCallback((width: number) => {
    const next = Math.round(width);
    if (next < MANY_MIN || next > MANY_MAX) return;
    setManyWidth(next);
    useResizeStore.getState().setRightSidebarWidth(next);
    try {
      localStorage.setItem(MANY_WIDTH_KEY, String(next));
    } catch { /* ignore unavailable storage */ }
  }, []);

  const handleToggleRightSidebar = useCallback(() => {
    setRightSidebarOpen((prev) => {
      const next = !prev;
      persistManyPanelOpen(next);
      return next;
    });
  }, []);

  const handleNewChat = useCallback(() => {
    useManyStore.getState().startNewChat();
    const sessionId = useManyStore.getState().currentSessionId;
    if (sessionId) openChatTab(sessionId, t('shell.new_chat'));
    if (!rightSidebarOpen) {
      setRightSidebarOpen(true);
      persistManyPanelOpen(true);
    }
  }, [openChatTab, rightSidebarOpen, t]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;
    const unsub = window.electron.on(
      'dome:open-settings-in-tab',
      (payload?: { section?: string }) => {
        useTabStore.getState().openSettingsTab();
        if (payload?.section) {
          window.dispatchEvent(
            new CustomEvent('dome:goto-settings-section', {
              detail: payload.section,
            }),
          );
        }
      },
    );
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

  // Clear HITL/chat override when leaving chat; panel visibility follows user toggle only.
  const [prevActiveTabId, setPrevActiveTabId] = useState(activeTabId ?? null);
  if ((activeTabId ?? null) !== prevActiveTabId) {
    setPrevActiveTabId(activeTabId ?? null);
    if (!isChatTab) {
      setManyRightOverride(false);
    }
  }

  useEffect(() => {
    const onReq = () => {
      const { tabs: tabList, activeTabId: aid } = useTabStore.getState();
      const tab = tabList.find((x) => x.id === aid);
      if (tab?.type === 'chat' || tab?.type === 'settings') return;
      setManyRightOverride(true);
      setRightSidebarOpen(true);
      persistManyPanelOpen(true);
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
      if (tab?.type === 'settings') return;
      if (tab?.type === 'chat') {
        setManyRightOverride(true);
      }
      setRightSidebarOpen(true);
      persistManyPanelOpen(true);
    };
    window.addEventListener('dome:many-sidebar-open', onOpenManySidebar);
    return () => window.removeEventListener('dome:many-sidebar-open', onOpenManySidebar);
  }, []);

  const showManyInSidebar = Boolean(
    rightSidebarOpen && !isSettingsTab && (!isChatTab || manyRightOverride),
  );
  const showManyInDesktopSidebar = showManyInSidebar && !narrowShell;

  // Keep the panel group structure stable (always 2 panels on desktop) and
  // collapse/expand Many imperatively. Remounting the group via `key` was
  // remounting ContentRouter → home/dashboard "reload" flash.
  // Defer + try/catch: react-resizable-panels can throw
  // "Panel constraints not found for Panel many-sidebar" on the first paint
  // before the panel registers its constraints (also crashes EmailView).
  useEffect(() => {
    if (narrowShell) return;
    let cancelled = false;
    let retryId = 0;

    const applyManyLayout = (attempt = 0) => {
      if (cancelled) return;
      const panel = manyPanelRef.current;
      if (!panel) {
        if (attempt < 8) {
          retryId = window.requestAnimationFrame(() => applyManyLayout(attempt + 1));
        }
        return;
      }
      try {
        if (showManyInDesktopSidebar) {
          if (panel.isCollapsed()) {
            panel.expand();
            // Cold start with defaultSize=0 has no "recent" size for expand().
            if (panel.getSize().inPixels < MANY_MIN) panel.resize(manyWidth);
          }
        } else if (!panel.isCollapsed()) {
          panel.collapse();
        }
      } catch {
        if (attempt < 8) {
          retryId = window.requestAnimationFrame(() => applyManyLayout(attempt + 1));
        }
      }
    };

    retryId = window.requestAnimationFrame(() => applyManyLayout(0));
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(retryId);
    };
    // manyWidth only applied when expanding from collapsed; omit from deps
    // so drag-resize does not re-enter this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [manyPanelRef, narrowShell, showManyInDesktopSidebar]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <TitleBar
        leftSidebarCollapsed={leftSidebarCollapsed}
        onToggleLeftSidebar={toggleLeftSidebar}
        rightSidebarOpen={rightSidebarOpen}
        onToggleRightSidebar={handleToggleRightSidebar}
        onNewChat={handleNewChat}
        settingsMode={isSettingsTab}
      />

      {/* ── Body row ── */}
      <div className="dome-app-body flex min-h-0 flex-1 overflow-hidden">
        {/* Left sidebar — Settings replaces UnifiedSidebar with section nav */}
        {isSettingsTab ? (
          <SettingsNav collapsed={leftSidebarCollapsed} />
        ) : (
          <UnifiedSidebar collapsed={leftSidebarCollapsed} />
        )}

        <ResizablePanelGroup
          orientation="horizontal"
          className="min-w-0 flex-1"
        >
          <ResizablePanel id="dome-content" minSize={420}>
            <main className="dome-main-content flex h-full min-w-0 flex-col overflow-hidden bg-card">
              <ContentRouter />
            </main>
          </ResizablePanel>

          {/* Many — always present on desktop so content does not remount on toggle. */}
          {!narrowShell ? (
            <>
              <ResizableHandle
                aria-label={t('shell.resize_right_panel', 'Redimensionar Many')}
                disabled={!showManyInDesktopSidebar}
                className={cn(
                  'bg-transparent hover:bg-border',
                  !showManyInDesktopSidebar && 'pointer-events-none opacity-0',
                )}
              />
              <ResizablePanel
                id="many-sidebar"
                panelRef={manyPanelRef}
                collapsible
                collapsedSize={0}
                defaultSize={showManyInDesktopSidebar ? manyWidth : 0}
                minSize={MANY_MIN}
                maxSize={MANY_MAX}
                groupResizeBehavior="preserve-pixel-size"
                onResize={(size) => {
                  try {
                    const px = Math.round(size.inPixels);
                    if (px < MANY_MIN / 2) return;
                    handleManyResize(px);
                  } catch {
                    /* panel constraints not ready yet */
                  }
                }}
              >
                <aside
                  className={cn(
                    'dome-right-panel flex h-full flex-col overflow-hidden bg-sidebar',
                    !showManyInDesktopSidebar && 'invisible',
                  )}
                  aria-label="Many"
                  aria-hidden={!showManyInDesktopSidebar}
                >
                  <ManyPanelWithSuspense
                    width={manyWidth}
                    onClose={handleToggleRightSidebar}
                    isVisible={showManyInDesktopSidebar}
                    isFullscreen={false}
                  />
                </aside>
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>

      <Sheet
        open={showManyInSidebar && narrowShell}
        onOpenChange={(open) => {
          if (!open && rightSidebarOpen) handleToggleRightSidebar();
        }}
      >
        <SheetContent side="right" showCloseButton={false} className="w-[min(92vw,30rem)] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Many</SheetTitle>
            <SheetDescription>{t('shell.right_panel_description', 'Asistente contextual de Dome')}</SheetDescription>
          </SheetHeader>
          <ManyPanelWithSuspense
            width={Math.min(manyWidth, 480)}
            onClose={handleToggleRightSidebar}
            isVisible
            isFullscreen={false}
          />
        </SheetContent>
      </Sheet>

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
