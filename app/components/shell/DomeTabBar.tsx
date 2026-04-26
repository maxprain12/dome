import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
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
  Network,
  LayoutTemplate,
  MoreHorizontal,
  ChevronLeft,
  Layers,
  Mic,
} from 'lucide-react';
import {
  useTabStore,
  type DomeTab,
  HOME_TAB_ID,
} from '@/lib/store/useTabStore';
import { getDomeTabDisplayTitle } from '@/lib/dome-tab-title';
import { useHorizontalScroll } from '@/lib/hooks/useHorizontalScroll';
import { FOLDER_COLOR_SWATCHES } from '@/components/home/FolderColorPicker';
import DomeButton from '@/components/ui/DomeButton';
import DomeDivider from '@/components/ui/DomeDivider';

const TAB_OVERFLOW_MIN_COUNT = 8;

function TabIcon({ tab }: { tab: DomeTab }) {
  const cls = 'w-3.5 h-3.5 shrink-0';
  const sw = 1.75;
  switch (tab.type) {
    case 'home': return <Home className={cls} strokeWidth={sw} />;
    case 'projects': return <Layers className={cls} strokeWidth={sw} />;
    case 'settings': return <Settings className={cls} strokeWidth={sw} />;
    case 'calendar': return <Calendar className={cls} strokeWidth={sw} />;
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
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent, tab: DomeTab) => void;
}

function TabItem({ tab, isActive, onActivate, onClose, onContextMenu }: TabItemProps) {
  const { t } = useTranslation();
  const displayTitle = getDomeTabDisplayTitle(tab, t);
  const folderColor = tab.type === 'folder' && tab.color ? tab.color : null;
  const accentColor = folderColor ?? 'var(--dome-accent)';
  return (
    <button
      type="button"
      onClick={onActivate}
      onContextMenu={(e) => onContextMenu(e, tab)}
      className="flex items-center gap-1.5 px-3 shrink-0 relative group transition-colors duration-100"
      style={{
        height: '100%',
        maxWidth: 180,
        minWidth: 80,
        fontSize: 12,
        fontWeight: 500,
        color: isActive ? 'var(--dome-text)' : 'var(--dome-text-muted)',
        background: isActive
          ? folderColor
            ? `${folderColor}12`
            : 'var(--dome-surface)'
          : 'transparent',
        borderRight: '1px solid var(--dome-border)',
        borderBottom: isActive ? `2px solid ${accentColor}` : '2px solid transparent',
        cursor: 'pointer',
        userSelect: 'none',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLButtonElement).style.background = folderColor
            ? `${folderColor}0d`
            : 'var(--dome-bg-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }
      }}
    >
      <TabIcon tab={tab} />
      <span className="truncate flex-1 text-left" style={{ maxWidth: 120 }}>
        {displayTitle}
      </span>
      {!tab.pinned && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onClose(); } }}
          className="flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
          style={{
            width: 16,
            height: 16,
            color: 'var(--dome-text-muted)',
          }}
          aria-label={t('workspace.close_tab', { title: displayTitle })}
        >
          <X className="w-3 h-3" strokeWidth={2} />
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
  } = useTabStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  useHorizontalScroll(scrollRef);

  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<TabCtxState | null>(null);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const overflowWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      setHasHorizontalOverflow(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length]);

  const showOverflowList =
    hasHorizontalOverflow || tabs.length >= TAB_OVERFLOW_MIN_COUNT;

  useEffect(() => {
    if (!overflowMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (overflowWrapRef.current?.contains(e.target as Node)) return;
      setOverflowMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [overflowMenuOpen]);

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

  const openTabContext = useCallback((e: React.MouseEvent, tab: DomeTab) => {
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
        className="flex items-stretch flex-1 min-w-0"
        style={{
          height: '100%',
          background: 'var(--dome-bg)',
        }}
      >
        {showOverflowList && (
          <div
            ref={overflowWrapRef}
            className="relative shrink-0 self-stretch"
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          >
            <DomeButton
              type="button"
              variant="ghost"
              size="sm"
              iconOnly
              onClick={() => setOverflowMenuOpen((o) => !o)}
              aria-expanded={overflowMenuOpen}
              aria-haspopup="menu"
              className="!rounded-none h-full w-8 min-h-0 rounded-none border-r border-[var(--dome-border)] text-[var(--dome-text-muted)] bg-[var(--dome-bg)] hover:bg-[var(--dome-bg-hover)] hover:text-[var(--dome-text)]"
              title={t('workspace.tab_menu_all_tabs')}
              aria-label={t('workspace.tab_menu_all_tabs')}
            >
              <MoreHorizontal className="w-4 h-4" strokeWidth={2} />
            </DomeButton>
            {overflowMenuOpen && (
              <div
                className="absolute left-0 top-full z-[9999] mt-0 w-[260px] overflow-hidden rounded-lg border border-[var(--dome-border)] bg-[var(--dome-surface)] py-1 shadow-lg"
                role="menu"
              >
                {tabs.map((tab) => (
                  <DomeButton
                    key={tab.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    role="menuitem"
                    className="w-full justify-start gap-2 rounded-none px-2.5 py-2 h-auto min-h-0 font-normal text-[var(--dome-text)] hover:bg-[var(--dome-bg-hover)]"
                    leftIcon={<TabIcon tab={tab} />}
                    onClick={() => {
                      activateTab(tab.id);
                      setOverflowMenuOpen(false);
                    }}
                  >
                    <span className="truncate">{getDomeTabDisplayTitle(tab, t)}</span>
                  </DomeButton>
                ))}
                <DomeDivider spacingClass="my-1" className="mx-1" />
                <DomeButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  role="menuitem"
                  className="w-full justify-start rounded-none px-2.5 py-2 h-auto min-h-0 font-normal text-[var(--dome-text)] hover:bg-[var(--dome-bg-hover)]"
                  onClick={() => {
                    closeAllUnpinnedTabs();
                    setOverflowMenuOpen(false);
                  }}
                >
                  {t('workspace.tab_menu_close_all_unpinned')}
                </DomeButton>
                <DomeButton
                  type="button"
                  variant="danger"
                  size="sm"
                  role="menuitem"
                  className="w-full justify-start rounded-none px-2.5 py-2 h-auto min-h-0 font-normal"
                  onClick={() => {
                    closeAllTabsToHome();
                    setOverflowMenuOpen(false);
                  }}
                >
                  {t('workspace.tab_menu_close_all')}
                </DomeButton>
              </div>
            )}
          </div>
        )}

        <div
          ref={scrollRef}
          className="flex items-stretch flex-1 min-w-0 overflow-x-auto scrollbar-none"
          style={{ height: '100%' }}
        >
          {tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onActivate={() => activateTab(tab.id)}
              onClose={() => closeTab(tab.id)}
              onContextMenu={openTabContext}
            />
          ))}

          <DomeButton
            type="button"
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onNewChat}
            className="!rounded-none h-full w-9 min-h-0 shrink-0 rounded-none border-r border-[var(--dome-border)] text-[var(--dome-text-muted)] hover:bg-[var(--dome-bg-hover)] hover:text-[var(--dome-text)]"
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            title={t('workspace.new_conversation')}
            aria-label={t('workspace.new_conversation')}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
          </DomeButton>

          <div className="flex-1 min-w-[12px]" />
        </div>
      </div>
    </>
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
    tabs,
  } = useTabStore();

  const { tab, view, x, y } = state;
  const displayTitle = getDomeTabDisplayTitle(tab, t);
  const idx = tabs.findIndex((q) => q.id === tab.id);
  const hasRight = idx >= 0 && idx < tabs.length - 1;
  const isHome = tab.id === HOME_TAB_ID;
  const canPinToggle = !isHome;
  const showColors = tab.type === 'folder' && Boolean(tab.resourceId);

  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 240),
    top: Math.min(y, window.innerHeight - 320),
    zIndex: 99999,
    minWidth: 200,
    maxWidth: 280,
    background: 'var(--dome-surface)',
    border: '1px solid var(--dome-border)',
    borderRadius: 10,
    boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
    padding: 6,
  };

  const itemBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    padding: '8px 10px',
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: 12.5,
    fontWeight: 500,
    color: 'var(--dome-text)',
  };

  const Item = ({
    label,
    onClick,
    disabled,
    danger,
  }: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
  }) => {
    const [hover, setHover] = useState(false);
    return (
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={() => { if (!disabled) onClick(); }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          ...itemBase,
          opacity: disabled ? 0.45 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: hover && !disabled ? 'var(--dome-bg-hover)' : 'transparent',
          color: danger ? 'var(--dome-danger, #ef4444)' : 'var(--dome-text)',
        }}
      >
        {label}
      </button>
    );
  };

  if (view === 'colors' && showColors) {
    return ReactDOM.createPortal(
      <div style={menuStyle} role="menu">
        <button
          type="button"
          onClick={onBackToMain}
          style={{ ...itemBase, marginBottom: 4 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
          {t('workspace.tab_menu_back')}
        </button>
        <div
          className="flex flex-wrap gap-1.5 px-1 pb-1"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
        >
          {FOLDER_COLOR_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                void persistFolderTabColor(tab, color);
                onClose();
              }}
              className="w-6 h-6 rounded border"
              style={{
                backgroundColor: color,
                borderColor: 'var(--dome-border)',
              }}
              aria-label={color}
            />
          ))}
        </div>
      </div>,
      document.body,
    );
  }

  return ReactDOM.createPortal(
    <div
      style={menuStyle}
      role="menu"
      aria-label={displayTitle}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <Item
        label={t('workspace.tab_menu_close')}
        disabled={Boolean(tab.pinned)}
        onClick={() => run(() => closeTab(tab.id))}
      />
      <Item
        label={t('workspace.tab_menu_close_others')}
        onClick={() => run(() => closeOtherTabs(tab.id))}
      />
      <Item
        label={t('workspace.tab_menu_close_to_right')}
        disabled={!hasRight}
        onClick={() => run(() => closeTabsToTheRight(tab.id))}
      />
      <DomeDivider spacingClass="my-1" className="mx-1" />
      <Item
        label={tab.pinned ? t('workspace.tab_menu_unpin') : t('workspace.tab_menu_pin')}
        disabled={!canPinToggle}
        onClick={() => run(() => togglePinTab(tab.id))}
      />
      {showColors && (
        <Item
          label={t('workspace.tab_menu_change_color')}
          onClick={() => onOpenColors()}
        />
      )}
      <Item
        label={t('workspace.tab_menu_duplicate')}
        disabled={isHome}
        onClick={() => run(() => duplicateTab(tab.id))}
      />
    </div>,
    document.body,
  );
}
