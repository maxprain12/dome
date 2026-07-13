import React, { useState, useCallback, useEffect } from 'react';
import ManyIcon from '@/components/many/ManyIcon';
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
import { HugeiconsIcon } from '@hugeicons/react';
import { CommandIcon, SidebarLeftIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
  MANY_PANEL_OPEN_KEY,
  MANY_PANEL_WIDTH_KEY,
} from '@/lib/shell/layoutReset';
import { useSyncManyActiveResourceContext } from '@/lib/many/useSyncManyActiveResourceContext';

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

  const openChatTab = useTabStore((s) => s.openChatTab);
  const { activeTabId, tabs } = useTabStore(
    useShallow((s) => ({ activeTabId: s.activeTabId, tabs: s.tabs })),
  );
  const leftSidebarCollapsed = useResizeStore((s) => s.leftSidebarCollapsed);
  const toggleLeftSidebar = useResizeStore((s) => s.toggleLeftSidebar);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isChatTab = activeTab?.type === 'chat';

  useSyncManyActiveResourceContext();

  const isElectron = typeof window !== 'undefined' && Boolean(window.electron);
  const isMac = isElectron && window.electron!.isMac;
  const isWindows = isElectron && window.electron!.isWindows;
  const isLinux = isElectron && window.electron!.isLinux;
  /** Windows/Linux use Electron's native window-controls overlay. */
  const needsRightTitleInset = Boolean(isWindows || isLinux);

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
      if (tab?.type === 'chat') return;
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
      if (tab?.type === 'chat') {
        setManyRightOverride(true);
      }
      setRightSidebarOpen(true);
      persistManyPanelOpen(true);
    };
    window.addEventListener('dome:many-sidebar-open', onOpenManySidebar);
    return () => window.removeEventListener('dome:many-sidebar-open', onOpenManySidebar);
  }, []);

  const showManyInSidebar = Boolean(rightSidebarOpen && (!isChatTab || manyRightOverride));
  const showManyInDesktopSidebar = showManyInSidebar && !narrowShell;

  const headerPlatform = !isElectron
    ? 'web'
    : isMac
      ? 'mac'
      : isWindows
        ? 'win'
        : 'linux';

  return (
    <div
      className="flex flex-col h-screen overflow-hidden bg-background"
      data-platform={headerPlatform}
      data-sidebar-collapsed={leftSidebarCollapsed ? 'true' : 'false'}
    >

      {/* ── Unified top bar (CSS grid: left chrome | tabs | actions) ── */}
      <header
        className="dome-shell-header shrink-0"
        data-platform={headerPlatform}
        data-sidebar-collapsed={leftSidebarCollapsed ? 'true' : 'false'}
        data-many-panel-open={showManyInSidebar ? 'true' : 'false'}
      >
        <div className="dome-shell-header-left" aria-hidden="true" />

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="dome-shell-sidebar-toggle rounded-none"
          data-active={!leftSidebarCollapsed ? 'true' : 'false'}
          onClick={toggleLeftSidebar}
          title={leftSidebarCollapsed ? t('shell.open_sidebar') : t('shell.close_sidebar')}
          aria-label={leftSidebarCollapsed ? t('shell.open_sidebar') : t('shell.close_sidebar')}
        >
          <HugeiconsIcon icon={SidebarLeftIcon} />
        </Button>

        <div className="dome-shell-header-tabs">
          <DomeTabBar onNewChat={handleNewChat} />

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-none"
            data-active={rightSidebarOpen ? 'true' : 'false'}
            onClick={handleToggleRightSidebar}
            title={rightSidebarOpen ? t('shell.close_right_panel') : t('shell.open_right_panel')}
            aria-label={rightSidebarOpen ? t('shell.close_right_panel') : t('shell.open_right_panel')}
            data-tour="many"
          >
            <span aria-hidden className="inline-flex [filter:var(--logo-filter)]">
              <ManyIcon size={14} />
            </span>
          </Button>
        </div>

        <div className="dome-shell-header-actions">
          <div className="dome-header-drag-zone" aria-hidden />

          <div className="dome-header-actions-inner no-drag">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('search.command_palette', 'Command')}
              data-tour="search"
              onClick={() => window.dispatchEvent(new CustomEvent('dome:open-command-palette'))}
            >
              <HugeiconsIcon icon={CommandIcon} />
            </Button>
            <TranscriptionPill />
          </div>

          {needsRightTitleInset ? <div className="dome-titlebar-inset-spacer" aria-hidden /> : null}
        </div>

      </header>

      {/* ── Body row ── */}
      <SidebarProvider
        open={!leftSidebarCollapsed}
        onOpenChange={(open) => {
          if (open === leftSidebarCollapsed) toggleLeftSidebar();
        }}
        className="dome-app-body min-h-0 flex-1 overflow-hidden"
      >
        {/* Left sidebar */}
        <UnifiedSidebar collapsed={leftSidebarCollapsed} onCollapse={toggleLeftSidebar} />

        <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1">
          <ResizablePanel id="dome-content" minSize={420}>
            <main className="dome-main-content flex h-full min-w-0 flex-col overflow-hidden bg-card">
              <ContentRouter />
            </main>
          </ResizablePanel>

          {/* Many es la única sidebar derecha de aplicación. */}
          {showManyInDesktopSidebar ? (
            <>
              <ResizableHandle aria-label={t('shell.resize_right_panel', 'Redimensionar Many')} />
              <ResizablePanel
                id="many-sidebar"
                defaultSize={manyWidth}
                minSize={MANY_MIN}
                maxSize={MANY_MAX}
                groupResizeBehavior="preserve-pixel-size"
                onResize={(size) => handleManyResize(size.inPixels)}
              >
                <aside className="dome-right-panel h-full overflow-hidden border-l border-border" aria-label="Many">
                  <ManyPanelWithSuspense
                    width={manyWidth}
                    onClose={handleToggleRightSidebar}
                    isVisible
                    isFullscreen={false}
                  />
                </aside>
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>

      </SidebarProvider>

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
