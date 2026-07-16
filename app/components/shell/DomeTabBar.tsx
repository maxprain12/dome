import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Activity01Icon,
  BookOpen01Icon,
  BotIcon,
  BubbleChatIcon,
  Calendar03Icon,
  Cancel01Icon,
  File01Icon,
  FileEditIcon,
  FolderOpenIcon,
  GlobeIcon,
  HierarchySquare01Icon,
  Home01Icon,
  Layers01Icon,
  LayoutTable01Icon,
  Mail01Icon,
  Mic01Icon,
  MoreHorizontalIcon,
  PlusSignIcon,
  Presentation01Icon,
  Settings01Icon,
  SparklesIcon,
  Store01Icon,
  Tag01Icon,
  Task01Icon,
  WalletCardsIcon,
  WorkflowSquare01Icon,
  YoutubeIcon,
  ZapIcon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FOLDER_COLOR_SWATCHES } from '@/components/home/FolderColorPicker';
import { getDomeTabDisplayTitle } from '@/lib/dome-tab-title';
import { useHorizontalScroll } from '@/lib/hooks/useHorizontalScroll';
import {
  AGENTS_TAB_ID,
  AUTOMATIONS_TAB_ID,
  CALENDAR_TAB_ID,
  EMAIL_TAB_ID,
  FLASHCARDS_TAB_ID,
  GITHUB_TAB_ID,
  HOME_TAB_ID,
  LEARN_TAB_ID,
  MARKETPLACE_TAB_ID,
  PROJECTS_TAB_ID,
  RUNS_TAB_ID,
  SETTINGS_TAB_ID,
  STUDIO_TAB_ID,
  TAGS_TAB_ID,
  TRANSCRIPTIONS_TAB_ID,
  WORKFLOWS_TAB_ID,
  isTabStripVisible,
  type DomeTab,
  useTabStore,
} from '@/lib/store/useTabStore';
import { cn } from '@/lib/utils';

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

const COMPACT_WIDTH_PER_TAB = 76;
const COMPACT_STRIP_WIDTH = 640;
const COMPACT_HYSTERESIS = 60;

function getTabIcon(tab: DomeTab): IconSvgElement {
  switch (tab.type) {
    case 'home': return Home01Icon;
    case 'projects': return Layers01Icon;
    case 'settings': return Settings01Icon;
    case 'calendar': return Calendar03Icon;
    case 'github': return Task01Icon;
    case 'email': return Mail01Icon;
    case 'chat': return BubbleChatIcon;
    case 'note': return FileEditIcon;
    case 'notebook': return BookOpen01Icon;
    case 'url': return GlobeIcon;
    case 'youtube': return YoutubeIcon;
    case 'ppt': return Presentation01Icon;
    case 'studio': return SparklesIcon;
    case 'flashcards': return WalletCardsIcon;
    case 'tags': return Tag01Icon;
    case 'marketplace': return Store01Icon;
    case 'pipelines':
    case 'workflows': return WorkflowSquare01Icon;
    case 'agents': return BotIcon;
    case 'automations': return ZapIcon;
    case 'runs': return Activity01Icon;
    case 'folder': return FolderOpenIcon;
    case 'learn': return BookOpen01Icon;
    case 'transcriptions':
    case 'transcription-detail': return Mic01Icon;
    case 'semantic-graph': return HierarchySquare01Icon;
    case 'artifact': return LayoutTable01Icon;
    default: return File01Icon;
  }
}

function TabIcon({ tab }: { tab: DomeTab }) {
  if (tab.type === 'folder' && tab.color) {
    return (
      <HugeiconsIcon
        icon={getTabIcon(tab)}
        className="size-3.5 shrink-0"
        style={{ color: tab.color }}
        strokeWidth={1.75}
        fill={`${tab.color}33`}
      />
    );
  }
  return (
    <HugeiconsIcon
      icon={getTabIcon(tab)}
      className={tab.type === 'folder' ? 'text-primary' : undefined}
    />
  );
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
  return typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {};
}

async function persistFolderTabColor(tab: DomeTab, color: string): Promise<void> {
  if (tab.type !== 'folder' || !tab.resourceId || !window.electron?.db?.resources) return;
  const result = await window.electron.db.resources.getById(tab.resourceId);
  if (!result?.success || !result.data) return;
  await window.electron.db.resources.update({
    id: tab.resourceId,
    metadata: { ...parseResourceMetadata(result.data.metadata), color },
    updated_at: Date.now(),
  });
  useTabStore.getState().updateTab(tab.id, { color });
}

function TabActions({ tab }: { tab: DomeTab }) {
  const { t } = useTranslation();
  const {
    activeTabId,
    tabs,
    closeTab,
    closeOtherTabs,
    closeTabsToTheRight,
    togglePinTab,
    duplicateTab,
    openResourceInSplit,
  } = useTabStore(
    useShallow((state) => ({
      activeTabId: state.activeTabId,
      tabs: state.tabs,
      closeTab: state.closeTab,
      closeOtherTabs: state.closeOtherTabs,
      closeTabsToTheRight: state.closeTabsToTheRight,
      togglePinTab: state.togglePinTab,
      duplicateTab: state.duplicateTab,
      openResourceInSplit: state.openResourceInSplit,
    })),
  );
  const index = tabs.findIndex((item) => item.id === tab.id);
  const activeTab = tabs.find((item) => item.id === activeTabId) ?? null;
  const isHome = tab.id === HOME_TAB_ID;
  const displayTitle = getDomeTabDisplayTitle(tab, t);
  const canOpenAsReference = Boolean(
    tab.resourceId &&
      tab.type !== 'folder' &&
      activeTab?.id !== tab.id &&
      activeTab?.id !== HOME_TAB_ID &&
      activeTab?.resourceId,
  );

  return (
    <ContextMenuContent>
      <ContextMenuGroup>
        <ContextMenuLabel className="max-w-64 truncate">{displayTitle}</ContextMenuLabel>
        <ContextMenuItem disabled={Boolean(tab.pinned)} onClick={() => closeTab(tab.id)}>
          {t('workspace.tab_menu_close')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => closeOtherTabs(tab.id)}>
          {t('workspace.tab_menu_close_others')}
        </ContextMenuItem>
        <ContextMenuItem disabled={index < 0 || index === tabs.length - 1} onClick={() => closeTabsToTheRight(tab.id)}>
          {t('workspace.tab_menu_close_to_right')}
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem disabled={isHome} onClick={() => togglePinTab(tab.id)}>
          {tab.pinned ? t('workspace.tab_menu_unpin') : t('workspace.tab_menu_pin')}
        </ContextMenuItem>
        {tab.type === 'folder' && tab.resourceId ? (
          <ContextMenuSub>
            <ContextMenuSubTrigger>{t('workspace.tab_menu_change_color')}</ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-44">
              <div className="grid grid-cols-5 gap-2 p-2">
                {FOLDER_COLOR_SWATCHES.map((color) => (
                  <Button
                    key={color}
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="rounded-full border-2"
                    style={{ backgroundColor: color }}
                    onClick={() => void persistFolderTabColor(tab, color)}
                    aria-label={color}
                  />
                ))}
              </div>
            </ContextMenuSubContent>
          </ContextMenuSub>
        ) : null}
        <ContextMenuItem disabled={isHome} onClick={() => duplicateTab(tab.id)}>
          {t('workspace.tab_menu_duplicate')}
        </ContextMenuItem>
      </ContextMenuGroup>
      {canOpenAsReference ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuItem
              onClick={() => {
                if (!tab.resourceId || !activeTab) return;
                openResourceInSplit(tab.resourceId, tab.type, tab.title || displayTitle, activeTab.id);
              }}
            >
              {t('workspace.tab_menu_open_as_reference', 'Abrir como referencia en pestaña activa')}
            </ContextMenuItem>
          </ContextMenuGroup>
        </>
      ) : null}
    </ContextMenuContent>
  );
}

function TabItem({
  tab,
  active,
  iconOnly,
  onActivate,
  onClose,
}: {
  tab: DomeTab;
  active: boolean;
  iconOnly: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tabRef = useRef<HTMLButtonElement>(null);
  const title = getDomeTabDisplayTitle(tab, t);
  const wasActive = useRef(active);

  useEffect(() => {
    if (active && !wasActive.current) tabRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    wasActive.current = active;
  }, [active]);

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex shrink-0 items-center [-webkit-app-region:no-drag]">
        <div
          className={cn(
            'group/tab flex h-8 max-w-52 items-center rounded-2xl border border-transparent',
            active ? 'border-border bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Button
            ref={tabRef}
            type="button"
            role="tab"
            variant="ghost"
            size={iconOnly ? 'icon-sm' : 'sm'}
            aria-selected={active}
            aria-label={title}
            tabIndex={active ? 0 : -1}
            onClick={onActivate}
            data-ui-target={`tab-${tab.type}`}
            className={cn('h-7 min-w-0 rounded-2xl px-2 hover:bg-transparent', !iconOnly && 'max-w-44')}
          >
            <TabIcon tab={tab} />
            {!iconOnly ? <span className="truncate">{title}</span> : null}
          </Button>
          {!tab.pinned && !iconOnly ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="mr-1 opacity-50 hover:opacity-100 focus-visible:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      onClose();
                    }}
                    aria-label={t('workspace.close_tab', { title })}
                  />
                }
              >
                <HugeiconsIcon icon={Cancel01Icon} />
              </TooltipTrigger>
              <TooltipContent>{t('workspace.close_tab', { title })}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </ContextMenuTrigger>
      <TabActions tab={tab} />
    </ContextMenu>
  );
}

export default function DomeTabBar({ onNewChat }: { onNewChat?: () => void }) {
  const { t } = useTranslation();
  const { tabs, activeTabId, activateTab, closeTab, closeAllUnpinnedTabs, closeAllTabsToHome } = useTabStore(
    useShallow((state) => ({
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      activateTab: state.activateTab,
      closeTab: state.closeTab,
      closeAllUnpinnedTabs: state.closeAllUnpinnedTabs,
      closeAllTabsToHome: state.closeAllTabsToHome,
    })),
  );
  const stripTabs = useMemo(() => tabs.filter(isTabStripVisible), [tabs]);
  const stripRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const newChatBtnRef = useRef<HTMLButtonElement>(null);
  useHorizontalScroll(scrollRef);
  const [overflow, setOverflow] = useState(false);
  const [compact, setCompact] = useState(false);
  const [fade, setFade] = useState({ left: false, right: false });

  useEffect(() => {
    const scroll = scrollRef.current;
    const strip = stripRef.current;
    if (!scroll) return;
    let frame = 0;
    const measure = () => {
      const width = strip?.clientWidth ?? scroll.clientWidth;
      const threshold = COMPACT_STRIP_WIDTH + Math.max(0, stripTabs.length - 3) * COMPACT_WIDTH_PER_TAB;
      setCompact((current) => current ? width < threshold + COMPACT_HYSTERESIS : width < threshold);
      setOverflow(scroll.scrollWidth > scroll.clientWidth + 1);
      setFade({
        left: scroll.scrollLeft > 1,
        right: scroll.scrollLeft + scroll.clientWidth < scroll.scrollWidth - 1,
      });
    };
    const schedule = () => {
      measure();
      frame = window.requestAnimationFrame(measure);
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(scroll);
    if (strip) observer.observe(strip);
    scroll.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      scroll.removeEventListener('scroll', measure);
    };
  }, [activeTabId, stripTabs.length]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.key === 'Tab' && stripTabs.length >= 2) {
        event.preventDefault();
        const current = Math.max(0, stripTabs.findIndex((tab) => tab.id === activeTabId));
        const next = event.shiftKey
          ? (current - 1 + stripTabs.length) % stripTabs.length
          : (current + 1) % stripTabs.length;
        activateTab(stripTabs[next].id);
      } else if (/^[1-9]$/.test(event.key) && !event.shiftKey && !event.altKey) {
        const index = Number(event.key) === 9 ? stripTabs.length - 1 : Number(event.key) - 1;
        if (stripTabs[index]) {
          event.preventDefault();
          activateTab(stripTabs[index].id);
        }
      } else if (event.key.toLowerCase() === 'w' && !event.shiftKey && !event.altKey) {
        const active = tabs.find((tab) => tab.id === activeTabId);
        if (active && !active.pinned && active.id !== HOME_TAB_ID) {
          event.preventDefault();
          closeTab(active.id);
        }
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [activateTab, activeTabId, closeTab, stripTabs, tabs]);

  const handleTablistKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(scrollRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    const current = buttons.findIndex((button) => button === document.activeElement);
    if (current < 0 || buttons.length === 0) return;
    event.preventDefault();
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : event.key === 'ArrowLeft'
          ? (current - 1 + buttons.length) % buttons.length
          : (current + 1) % buttons.length;
    buttons[next]?.focus();
  }, []);

  return (
    <div ref={stripRef} className="flex min-w-0 flex-1 items-stretch bg-transparent [-webkit-app-region:drag]">
      <div className="relative flex min-w-0 flex-1 items-center">
        <div
          ref={scrollRef}
          role="tablist"
          aria-label={t('workspace.tabs', { defaultValue: 'Tabs' })}
          tabIndex={-1}
          onKeyDown={handleTablistKeyDown}
          className={cn(
            'flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            fade.left && '[mask-image:linear-gradient(to_right,transparent,black_16px,black_100%)]',
            fade.right && '[mask-image:linear-gradient(to_right,black_0,black_calc(100%_-_16px),transparent_100%)]',
            fade.left && fade.right && '[mask-image:linear-gradient(to_right,transparent_0,black_16px,black_calc(100%_-_16px),transparent_100%)]',
          )}
        >
          {stripTabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <TabItem
                key={tab.id}
                tab={tab}
                active={active}
                iconOnly={!active && (tab.pinned || (compact && HUB_TAB_IDS.has(tab.id)))}
                onActivate={() => activateTab(tab.id)}
                onClose={() => closeTab(tab.id)}
              />
            );
          })}
        </div>
      </div>

      {overflow ? (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="h-full shrink-0 rounded-none border-l [-webkit-app-region:no-drag]"
                      aria-label={t('workspace.tab_menu_all_tabs')}
                    />
                  }
                />
              }
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </TooltipTrigger>
            <TooltipContent>{t('workspace.tab_menu_all_tabs')}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="max-h-[min(32rem,calc(100vh-3rem))] w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t('workspace.tab_menu_all_tabs')}</DropdownMenuLabel>
              {stripTabs.map((tab) => (
                <DropdownMenuItem key={tab.id} onClick={() => activateTab(tab.id)} className={tab.id === activeTabId ? 'bg-muted' : undefined}>
                  <TabIcon tab={tab} />
                  <span className="truncate">{getDomeTabDisplayTitle(tab, t)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={closeAllUnpinnedTabs}>
              {t('workspace.tab_menu_close_all_unpinned')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={closeAllTabsToHome}>
              {t('workspace.tab_menu_close_all')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              ref={newChatBtnRef}
              type="button"
              variant="outline"
              size="icon-sm"
              className="m-1 shrink-0 self-center border-dashed [-webkit-app-region:no-drag]"
              onClick={onNewChat}
              aria-label={t('workspace.new_conversation')}
            />
          }
        >
          <HugeiconsIcon icon={PlusSignIcon} />
        </TooltipTrigger>
        <TooltipContent>{t('workspace.new_conversation')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
