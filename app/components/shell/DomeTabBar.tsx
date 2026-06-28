import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Home,
  Settings,
  Calendar,
  MessageCircle,
  FileEdit,
  BookOpen,
  Globe,
  Youtube,
  Presentation,
  File,
  X,
  Plus,
  Sparkles,
  WalletCards,
  Tag,
  Store,
  Zap,
  FolderOpen,
  Bot,
  Workflow,
  Activity,
  Mail,
  ListTodo,
  Network,
  LayoutTemplate,
  MoreHorizontal,
  ChevronLeft,
  Layers,
  Mic,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  useTabStore,
  type DomeTab,
  HOME_TAB_ID,
  SETTINGS_TAB_ID,
  CALENDAR_TAB_ID,
  GITHUB_TAB_ID,
  EMAIL_TAB_ID,
  STUDIO_TAB_ID,
  FLASHCARDS_TAB_ID,
  LEARN_TAB_ID,
  TAGS_TAB_ID,
  MARKETPLACE_TAB_ID,
  AGENTS_TAB_ID,
  WORKFLOWS_TAB_ID,
  AUTOMATIONS_TAB_ID,
  RUNS_TAB_ID,
  PROJECTS_TAB_ID,
  TRANSCRIPTIONS_TAB_ID,
} from '@/lib/store/useTabStore';
import { getDomeTabDisplayTitle } from '@/lib/dome-tab-title';
import { useHorizontalScroll } from '@/lib/hooks/useHorizontalScroll';
import { FOLDER_COLOR_SWATCHES } from '@/components/home/FolderColorPicker';
import DomeDivider from '@/components/ui/DomeDivider';

/** Fixed-id hub tabs — icon-only when inactive in compact mode */
const HUB_TAB_IDS = new Set([
  HOME_TAB_ID,
  SETTINGS_TAB_ID,
  CALENDAR_TAB_ID,
  GITHUB_TAB_ID,
  EMAIL_TAB_ID,
  STUDIO_TAB_ID,
  FLASHCARDS_TAB_ID,
  LEARN_TAB_ID,
  TAGS_TAB_ID,
  MARKETPLACE_TAB_ID,
  AGENTS_TAB_ID,
  WORKFLOWS_TAB_ID,
  AUTOMATIONS_TAB_ID,
  RUNS_TAB_ID,
  PROJECTS_TAB_ID,
  TRANSCRIPTIONS_TAB_ID,
]);

/** Extra width (px) each open tab adds to the compact threshold */
const COMPACT_WIDTH_PER_TAB = 76;
/** Total strip width (px) at/below which the hub collapses to icons (≤3 tabs) */
const COMPACT_STRIP_WIDTH = 640;
/** Dead-band (px) so the compact decision never flip-flops around the threshold */
const COMPACT_HYSTERESIS = 60;

function TabIcon({ tab }: { tab: DomeTab }) {
  const cls = 'size-3.5 shrink-0';
  const sw = 1.75;
  switch (tab.type) {
    case 'home': return <Home className={cls} strokeWidth={sw} />;
    case 'projects': return <Layers className={cls} strokeWidth={sw} />;
    case 'settings': return <Settings className={cls} strokeWidth={sw} />;
    case 'calendar': return <Calendar className={cls} strokeWidth={sw} />;
    case 'github': return <ListTodo className={cls} strokeWidth={sw} />;
    case 'email': return <Mail className={cls} strokeWidth={sw} />;
    case 'chat': return <MessageCircle className={cls} strokeWidth={sw} />;
    case 'note': return <FileEdit className={cls} strokeWidth={sw} />;
    case 'notebook': return <BookOpen className={cls} strokeWidth={sw} />;
    case 'url': return <Globe className={cls} strokeWidth={sw} />;
    case 'youtube': return <Youtube className={cls} strokeWidth={sw} />;
    case 'ppt': return <Presentation className={cls} strokeWidth={sw} />;
    case 'resource': return <File className={cls} strokeWidth={sw} />;
    case 'studio': return <Sparkles className={cls} strokeWidth={sw} />;
    case 'flashcards': return <WalletCards className={cls} strokeWidth={sw} />;
    case 'tags': return <Tag className={cls} strokeWidth={sw} />;
    case 'marketplace': return <Store className={cls} strokeWidth={sw} />;
    case 'pipelines': return <Workflow className={cls} strokeWidth={sw} />;
    case 'agents': return <Bot className={cls} strokeWidth={sw} />;
    case 'workflows': return <Workflow className={cls} strokeWidth={sw} />;
    case 'automations': return <Zap className={cls} strokeWidth={sw} />;
    case 'runs': return <Activity className={cls} strokeWidth={sw} />;
    case 'folder': return <FolderOpen className={cls} strokeWidth={sw} style={tab.color ? { color: tab.color } : undefined} />;
    case 'learn': return <BookOpen className={cls} strokeWidth={sw} />;
    case 'transcriptions':
    case 'transcription-detail':
      return <Mic className={cls} strokeWidth={sw} />;
    case 'semantic-graph':
      return <Network className={cls} strokeWidth={sw} />;
    case 'artifact':
      return <LayoutTemplate className={cls} strokeWidth={sw} />;
    default: return <File className={cls} strokeWidth={sw} />;
  }
}

function parseResourceMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return { ...(raw as Record<string, unknown>) };
  return {};
}

async function persistFolderTabColor(tab: DomeTab, color: string): Promise<void> {
  if (tab.type !== 'folder' || !tab.resourceId || !window.electron?.db?.resources) return;
  const res = await window.electron.db.resources.getById(tab.resourceId);
  if (!res?.success || !res.data) return;
  const meta = parseResourceMetadata(res.data.metadata);
  await window.electron.db.resources.update({
    id: tab.resourceId,
    metadata: { ...meta, color },
    updated_at: Date.now(),
  });
  useTabStore.getState().updateTab(tab.id, { color });
}

type TabCtxState = {
  x: number;
  y: number;
  tab: DomeTab;
  view: 'main' | 'colors';
};

interface TabItemProps {
  tab: DomeTab;
  isActive: boolean;
  iconOnly: boolean;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: (e: ReactMouseEvent, tab: DomeTab) => void;
}

function TabItem({ tab, isActive, iconOnly, onActivate, onClose, onContextMenu }: TabItemProps) {
  const { t } = useTranslation();
  const btnRef = useRef<HTMLButtonElement>(null);
  const displayTitle = getDomeTabDisplayTitle(tab, t);
  const folderColor = tab.type === 'folder' && tab.color ? tab.color : null;
  const accentColor = folderColor ?? 'var(--dome-accent)';
  const isHubTab = HUB_TAB_IDS.has(tab.id);
  const prevIsActiveRef = useRef(isActive);
  if (isActive && !prevIsActiveRef.current) {
    btnRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }
  prevIsActiveRef.current = isActive;
  return (
    <button
      ref={btnRef}
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={displayTitle}
      tabIndex={isActive ? 0 : -1}
      onClick={onActivate}
      onContextMenu={(e) => onContextMenu(e, tab)}
      data-ui-target={`tab-${tab.type}`}
      className="dome-tab-item"
      data-active={isActive ? 'true' : 'false'}
      data-hub={isHubTab ? 'true' : 'false'}
      data-icon-only={iconOnly ? 'true' : 'false'}
      data-has-accent={folderColor ? 'true' : 'false'}
      title={iconOnly ? displayTitle : undefined}
      style={{ ['--dome-tab-accent' as string]: accentColor }}
    >
      <TabIcon tab={tab} />
      <span className="dome-tab-item-title">{displayTitle}</span>
      {!tab.pinned && (
        // Close control lives inside the tab button — nested <button> is invalid HTML.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
        <span
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation();
              onClose();
            }
          }}
          className="dome-tab-close"
          aria-label={t('workspace.close_tab', { title: displayTitle })}
        >
          <X className="size-3" strokeWidth={2} />
        </span>
      )}
    </button>
  );
}

interface DomeTabBarProps {
  onNewChat?: () => void;
}

export default function DomeTabBar({ onNewChat }: DomeTabBarProps) {
  const { t } = useTranslation();
  const {
    tabs,
    activeTabId,
    activateTab,
    closeTab,
    closeAllUnpinnedTabs,
    closeAllTabsToHome,
  } = useTabStore(
    useShallow((s) => ({
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      activateTab: s.activateTab,
      closeTab: s.closeTab,
      closeAllUnpinnedTabs: s.closeAllUnpinnedTabs,
      closeAllTabsToHome: s.closeAllTabsToHome,
    })),
  );

  const stripRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useHorizontalScroll(scrollRef);

  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const [needsCompactLayout, setNeedsCompactLayout] = useState(false);
  const [scrollFade, setScrollFade] = useState({ left: false, right: false });
  const [ctxMenu, setCtxMenu] = useState<TabCtxState | null>(null);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const [overflowAnchor, setOverflowAnchor] = useState<{ top: number; left: number } | null>(null);
  const overflowWrapRef = useRef<HTMLDivElement>(null);
  const overflowBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    const strip = stripRef.current;
    if (!el) return;

    let raf2 = 0;

    const measure = () => {
      const scrollClient = el.clientWidth;

      // Compact decision uses ONLY the stable total strip width (set by the
      // parent flex, independent of whether hub tabs show labels) plus the tab
      // count, with hysteresis. It must NOT use the inner scroll width or any
      // content-derived signal (overflow/truncation), because those change when
      // compact mode is applied and would feed back into a size oscillation.
      const stripW = strip?.clientWidth ?? scrollClient;
      const compactThreshold =
        COMPACT_STRIP_WIDTH + Math.max(0, tabs.length - 3) * COMPACT_WIDTH_PER_TAB;
      setNeedsCompactLayout((prev) =>
        prev ? stripW < compactThreshold + COMPACT_HYSTERESIS : stripW < compactThreshold,
      );

      // Overflow + scroll fades concern the scrollable tab strip only and never
      // influence compactness.
      setHasHorizontalOverflow(el.scrollWidth > scrollClient + 1);
      setScrollFade({
        left: el.scrollLeft > 1,
        right: el.scrollLeft + scrollClient < el.scrollWidth - 1,
      });
    };

    const scheduleMeasure = () => {
      measure();
      raf2 = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    const ro = new ResizeObserver(scheduleMeasure);
    ro.observe(el);
    if (strip) ro.observe(strip);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.cancelAnimationFrame(raf2);
      ro.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, [tabs, activeTabId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      // Ctrl/Cmd+Tab — cycle through tabs
      if (e.key === 'Tab' && tabs.length >= 2) {
        e.preventDefault();
        const idx = tabs.findIndex((tab) => tab.id === activeTabId);
        if (idx < 0) return;
        const nextIdx = e.shiftKey
          ? (idx - 1 + tabs.length) % tabs.length
          : (idx + 1) % tabs.length;
        activateTab(tabs[nextIdx].id);
        return;
      }

      // Ctrl/Cmd+W — close the active tab (pinned/home tabs stay open)
      if ((e.key === 'w' || e.key === 'W') && !e.shiftKey && !e.altKey) {
        const active = tabs.find((tab) => tab.id === activeTabId);
        if (active && !active.pinned && active.id !== HOME_TAB_ID) {
          e.preventDefault();
          closeTab(active.id);
        }
        return;
      }

      // Ctrl/Cmd+1..9 — jump to tab N (9 = last tab, like browsers)
      if (!e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        const n = Number(e.key);
        const target = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1];
        if (target) {
          e.preventDefault();
          activateTab(target.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabs, activeTabId, activateTab, closeTab]);

  /* WAI-ARIA tabs: arrow keys move focus between tabs (roving tabindex) */
  const onTablistKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const list = scrollRef.current;
    if (!list) return;
    const tabButtons = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    if (tabButtons.length === 0) return;
    const focused = document.activeElement as HTMLElement | null;
    const currentIdx = tabButtons.findIndex((b) => b === focused);
    if (currentIdx < 0) return;
    e.preventDefault();
    let nextIdx = currentIdx;
    if (e.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + tabButtons.length) % tabButtons.length;
    else if (e.key === 'ArrowRight') nextIdx = (currentIdx + 1) % tabButtons.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = tabButtons.length - 1;
    tabButtons[nextIdx]?.focus();
  }, []);

  const isCompact = needsCompactLayout;

  const tabIconOnly = useCallback(
    (tab: DomeTab, isActive: boolean) => {
      if (isActive) return false;
      if (tab.pinned) return true;
      if (isCompact && HUB_TAB_IDS.has(tab.id)) return true;
      return false;
    },
    [isCompact],
  );

  if (!hasHorizontalOverflow && overflowMenuOpen) {
    setOverflowMenuOpen(false);
    setOverflowAnchor(null);
  }

  useEffect(() => {
    if (!overflowMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (overflowWrapRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.('.dome-tab-overflow-menu')) return;
      setOverflowMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverflowMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [overflowMenuOpen]);

  const toggleOverflowMenu = useCallback(() => {
    setOverflowMenuOpen((open) => {
      const next = !open;
      if (next && overflowBtnRef.current) {
        const rect = overflowBtnRef.current.getBoundingClientRect();
        setOverflowAnchor({
          top: rect.bottom + 4,
          left: Math.min(rect.left, window.innerWidth - 296),
        });
      } else if (!next) {
        setOverflowAnchor(null);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    /* Bubble phase so clicks on menu items run before we close */
    document.addEventListener('click', close, false);
    document.addEventListener('contextmenu', close, false);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close, false);
      document.removeEventListener('contextmenu', close, false);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

  const openTabContext = useCallback((e: ReactMouseEvent, tab: DomeTab) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, tab, view: 'main' });
  }, []);

  const closeCtx = useCallback(() => setCtxMenu(null), []);

  /* Render context menu with local view switch (fix broken color submenu) */
  const ctxPortal = ctxMenu && (
    <TabContextMenuBridge
      state={ctxMenu}
      onClose={closeCtx}
      onOpenColors={() => {
        setCtxMenu((s) => (s ? { ...s, view: 'colors' } : null));
      }}
      onBackToMain={() => {
        setCtxMenu((s) => (s ? { ...s, view: 'main' } : null));
      }}
    />
  );

  return (
    <>
      {ctxPortal}
      <div
        ref={stripRef}
        className="dome-tab-strip flex items-stretch flex-1 min-w-0"
        data-compact={isCompact ? 'true' : 'false'}
      >
        {overflowMenuOpen && overflowAnchor
          ? ReactDOM.createPortal(
              <div
                className="dome-tab-overflow-menu"
                role="menu"
                style={{ top: overflowAnchor.top, left: overflowAnchor.left }}
              >
                <div className="dome-tab-overflow-list">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="menuitem"
                      className="dome-tab-overflow-item"
                      data-active={tab.id === activeTabId ? 'true' : 'false'}
                      onClick={() => {
                        activateTab(tab.id);
                        setOverflowMenuOpen(false);
                        setOverflowAnchor(null);
                      }}
                    >
                      <TabIcon tab={tab} />
                      <span>{getDomeTabDisplayTitle(tab, t)}</span>
                    </button>
                  ))}
                </div>
                <div className="dome-tab-overflow-footer">
                  <button
                    type="button"
                    role="menuitem"
                    className="dome-tab-overflow-action dome-tab-overflow-action--secondary"
                    onClick={() => {
                      closeAllUnpinnedTabs();
                      setOverflowMenuOpen(false);
                      setOverflowAnchor(null);
                    }}
                  >
                    {t('workspace.tab_menu_close_all_unpinned')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="dome-tab-overflow-action dome-tab-overflow-action--danger"
                    onClick={() => {
                      closeAllTabsToHome();
                      setOverflowMenuOpen(false);
                      setOverflowAnchor(null);
                    }}
                  >
                    {t('workspace.tab_menu_close_all')}
                  </button>
                </div>
              </div>,
              document.body,
            )
          : null}

        <div className="dome-tab-scroll-wrap">
          <div
            ref={scrollRef}
            className="dome-tab-scroll"
            tabIndex={-1}
            role="tablist"
            aria-label={t('workspace.tabs', { defaultValue: 'Tabs' })}
            onKeyDown={onTablistKeyDown}
            data-fade-left={scrollFade.left ? 'true' : 'false'}
            data-fade-right={scrollFade.right ? 'true' : 'false'}
          >
            {tabs.map((tab) => (
              <TabItem
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                iconOnly={tabIconOnly(tab, tab.id === activeTabId)}
                onActivate={() => activateTab(tab.id)}
                onClose={() => closeTab(tab.id)}
                onContextMenu={openTabContext}
              />
            ))}
          </div>
        </div>

        {hasHorizontalOverflow ? (
          <div
            ref={overflowWrapRef}
            className="relative shrink-0 self-stretch"
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          >
            <button
              ref={overflowBtnRef}
              type="button"
              className="dome-tab-overflow-btn"
              onClick={toggleOverflowMenu}
              aria-expanded={overflowMenuOpen}
              aria-haspopup="menu"
              title={t('workspace.tab_menu_all_tabs')}
              aria-label={t('workspace.tab_menu_all_tabs')}
            >
              <MoreHorizontal className="size-4" strokeWidth={2} />
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="dome-tab-new-btn"
          onClick={onNewChat}
          title={t('workspace.new_conversation')}
          aria-label={t('workspace.new_conversation')}
        >
          <Plus className="size-3.5" strokeWidth={2} />
        </button>
      </div>
    </>
  );
}

function TabContextMenuItem({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="dome-tab-ctx-item"
      data-danger={danger ? 'true' : undefined}
      onClick={() => {
        if (!disabled) onClick();
      }}
    >
      {label}
    </button>
  );
}

/** Connects context menu actions and color-submenu navigation */
function TabContextMenuBridge({
  state,
  onClose,
  onOpenColors,
  onBackToMain,
}: {
  state: TabCtxState;
  onClose: () => void;
  onOpenColors: () => void;
  onBackToMain: () => void;
}) {
  const { t } = useTranslation();
  const {
    closeTab,
    closeOtherTabs,
    closeTabsToTheRight,
    togglePinTab,
    duplicateTab,
    openResourceInSplit,
    tabs,
    activeTabId,
  } = useTabStore(
    useShallow((s) => ({
      closeTab: s.closeTab,
      closeOtherTabs: s.closeOtherTabs,
      closeTabsToTheRight: s.closeTabsToTheRight,
      togglePinTab: s.togglePinTab,
      duplicateTab: s.duplicateTab,
      openResourceInSplit: s.openResourceInSplit,
      tabs: s.tabs,
      activeTabId: s.activeTabId,
    })),
  );

  const { tab, view, x, y } = state;
  const displayTitle = getDomeTabDisplayTitle(tab, t);
  const idx = tabs.findIndex((q) => q.id === tab.id);
  const hasRight = idx >= 0 && idx < tabs.length - 1;
  const isHome = tab.id === HOME_TAB_ID;
  const canPinToggle = !isHome;
  const showColors = tab.type === 'folder' && Boolean(tab.resourceId);

  /**
   * "Open as reference in active tab" — moves this tab's resource into the
   * split pane of the currently active tab. Only meaningful when:
   *   - this tab carries a resource (notes, pdfs, urls, etc.),
   *   - the active tab is a different one,
   *   - the active tab can host a split (any non-home tab with a resource).
   */
  const activeTab = tabs.find((q) => q.id === activeTabId) ?? null;
  const canOpenAsReference =
    Boolean(tab.resourceId) &&
    tab.type !== 'folder' &&
    activeTab !== null &&
    activeTab.id !== tab.id &&
    activeTab.id !== HOME_TAB_ID &&
    Boolean(activeTab.resourceId);

  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  const menuStyle: CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 240),
    top: Math.min(y, window.innerHeight - 320),
    zIndex: 100000,
  };

  if (view === 'colors' && showColors) {
    return ReactDOM.createPortal(
      <div className="dome-tab-ctx-menu" style={menuStyle} role="menu">
        <button
          type="button"
          className="dome-tab-ctx-item"
          onClick={onBackToMain}
          style={{ marginBottom: 4 }}
        >
          <ChevronLeft className="size-3.5 shrink-0" />
          {t('workspace.tab_menu_back')}
        </button>
        <fieldset className="flex flex-wrap gap-1.5 border-0 p-0 m-0 min-w-0 px-1 pb-1">
          {FOLDER_COLOR_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                void persistFolderTabColor(tab, color);
                onClose();
              }}
              className="size-6 rounded border"
              style={{
                backgroundColor: color,
                borderColor: 'var(--dome-border)',
              }}
              aria-label={color}
            />
          ))}
        </fieldset>
      </div>,
      document.body,
    );
  }

  return ReactDOM.createPortal(
    <div
      className="dome-tab-ctx-menu"
      style={menuStyle}
      tabIndex={-1}
      role="menu"
      aria-label={displayTitle}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <TabContextMenuItem
        label={t('workspace.tab_menu_close')}
        disabled={Boolean(tab.pinned)}
        onClick={() => run(() => closeTab(tab.id))}
      />
      <TabContextMenuItem
        label={t('workspace.tab_menu_close_others')}
        onClick={() => run(() => closeOtherTabs(tab.id))}
      />
      <TabContextMenuItem
        label={t('workspace.tab_menu_close_to_right')}
        disabled={!hasRight}
        onClick={() => run(() => closeTabsToTheRight(tab.id))}
      />
      <DomeDivider spacingClass="my-1" className="mx-1" />
      <TabContextMenuItem
        label={tab.pinned ? t('workspace.tab_menu_unpin') : t('workspace.tab_menu_pin')}
        disabled={!canPinToggle}
        onClick={() => run(() => togglePinTab(tab.id))}
      />
      {showColors && (
        <TabContextMenuItem
          label={t('workspace.tab_menu_change_color')}
          onClick={() => onOpenColors()}
        />
      )}
      <TabContextMenuItem
        label={t('workspace.tab_menu_duplicate')}
        disabled={isHome}
        onClick={() => run(() => duplicateTab(tab.id))}
      />
      {canOpenAsReference && (
        <>
          <DomeDivider spacingClass="my-1" className="mx-1" />
          <TabContextMenuItem
            label={t('workspace.tab_menu_open_as_reference', 'Abrir como referencia en pestaña activa')}
            onClick={() =>
              run(() => {
                if (!tab.resourceId || !activeTab) return;
                openResourceInSplit(
                  tab.resourceId,
                  tab.type,
                  tab.title || displayTitle,
                  activeTab.id,
                );
              })
            }
          />
        </>
      )}
    </div>,
    document.body,
  );
}
