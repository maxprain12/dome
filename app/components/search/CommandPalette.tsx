import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import DomeResourceIcon from '@/components/ui/DomeResourceIcon';
import { useMenuNavigation } from '@/hooks/use-menu-navigation';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore, HOME_TAB_ID } from '@/lib/store/useTabStore';
import { useFeaturesStore } from '@/lib/store/useFeaturesStore';
import { isFeatureVisible } from '@/lib/features/featureKeys';
import { recordSearchResultSelected } from '@/lib/search/search-signals';
import { formatDistanceToNow } from '@/lib/utils';
import { buildNavigationDestinations, buildQuickActions } from './commandPaletteNav';
import { matchesQuery, modKeyLabel, type PaletteRow } from './commandPaletteTypes';
import { useCommandPaletteSearch } from './useCommandPaletteSearch';
import { CommandPaletteResultsList } from './CommandPaletteResultsList';

export default function CommandPalette() {
  const { t } = useTranslation();
  const currentProject = useAppStore((s) => s.currentProject);
  const setHomeSidebarSection = useAppStore((s) => s.setHomeSidebarSection);
  const featureVisibility = useFeaturesStore((s) => s.visibility);
  const loadFeatures = useFeaturesStore((s) => s.loadFeatures);
  const featuresLoaded = useFeaturesStore((s) => s.loaded);

  const {
    activateTab,
    openResourceTab,
    openFolderTab,
    openSettingsTab,
    openCalendarTab,
    openGitHubTab,
    openEmailTab,
    openProjectsTab,
    openLearnTab,
    openMarketplaceTab,
    openAgentsTab,
    openWorkflowsTab,
    openAutomationsTab,
    openRunsTab,
  } = useTabStore(
    useShallow((s) => ({
      activateTab: s.activateTab,
      openResourceTab: s.openResourceTab,
      openFolderTab: s.openFolderTab,
      openSettingsTab: s.openSettingsTab,
      openCalendarTab: s.openCalendarTab,
      openGitHubTab: s.openGitHubTab,
      openEmailTab: s.openEmailTab,
      openProjectsTab: s.openProjectsTab,
      openLearnTab: s.openLearnTab,
      openMarketplaceTab: s.openMarketplaceTab,
      openAgentsTab: s.openAgentsTab,
      openWorkflowsTab: s.openWorkflowsTab,
      openAutomationsTab: s.openAutomationsTab,
      openRunsTab: s.openRunsTab,
    })),
  );

  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const projectId = currentProject?.id ?? 'default';
  const { searchState, trimmedQuery, setQuery, resetSearch } = useCommandPaletteSearch(isOpen, projectId, t);
  const { query, resources, interactions, isSearching } = searchState;

  useEffect(() => {
    if (!featuresLoaded) void loadFeatures();
  }, [featuresLoaded, loadFeatures]);

  const navVisible = useCallback(
    (key: string) => isFeatureVisible(featureVisibility, key),
    [featureVisibility],
  );

  const close = useCallback(() => {
    setIsOpen(false);
    resetSearch();
  }, [resetSearch]);

  const open = useCallback(() => {
    setIsOpen(true);
    resetSearch();
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [resetSearch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => {
          if (prev) {
            resetSearch();
            return false;
          }
          resetSearch();
          window.setTimeout(() => inputRef.current?.focus(), 40);
          return true;
        });
      }
    };
    const onOpenEvent = () => open();
    document.addEventListener('keydown', onKey);
    window.addEventListener('dome:open-command-palette', onOpenEvent);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('dome:open-command-palette', onOpenEvent);
    };
  }, [open, resetSearch]);

  useEffect(() => {
    if (!isOpen) return;
    const onBackdrop = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', onBackdrop);
    return () => document.removeEventListener('mousedown', onBackdrop);
  }, [isOpen, close]);

  const goHome = useCallback(() => {
    setHomeSidebarSection('library');
    activateTab(HOME_TAB_ID);
  }, [activateTab, setHomeSidebarSection]);

  const openResource = useCallback(
    (resource: { id: string; type: string; title: string; project_id?: string }, rank1Indexed: number, category: string) => {
      recordSearchResultSelected({
        surface: 'cmdk_modal',
        query: trimmedQuery,
        selectedId: resource.id,
        rank1Indexed,
        category,
      });
      const resourceProjectId = resource.project_id;
      if (resource.type === 'folder') {
        openFolderTab(resource.id, resource.title, undefined, resourceProjectId);
      } else {
        openResourceTab(resource.id, resource.type, resource.title, resourceProjectId);
      }
      close();
    },
    [close, openFolderTab, openResourceTab, trimmedQuery],
  );

  const navigationDestinations = useMemo(
    () =>
      buildNavigationDestinations({
        t,
        navVisible,
        close,
        goHome,
        openProjectsTab,
        openCalendarTab,
        openGitHubTab,
        openEmailTab,
        openAgentsTab,
        openWorkflowsTab,
        openAutomationsTab,
        openRunsTab,
      openLearnTab,
      openMarketplaceTab,
      openSettingsTab,
      }),
    [
      close,
      goHome,
      navVisible,
      openAgentsTab,
      openAutomationsTab,
      openCalendarTab,
      openEmailTab,
      openGitHubTab,
      openLearnTab,
      openMarketplaceTab,
      openProjectsTab,
      openRunsTab,
      openSettingsTab,
      openWorkflowsTab,
      t,
    ],
  );

  const quickActions = useMemo(
    () =>
      buildQuickActions({
        t,
        close,
        projectId,
        openResourceTab,
      }),
    [close, projectId, openResourceTab, t],
  );

  const filteredNav = useMemo(() => {
    if (!trimmedQuery) return navigationDestinations;
    return navigationDestinations.filter((row) => matchesQuery(row.label, trimmedQuery));
  }, [navigationDestinations, trimmedQuery]);

  const flatRows = useMemo((): PaletteRow[] => {
    const rows: PaletteRow[] = [];

    if (!trimmedQuery) {
      rows.push(...quickActions, ...navigationDestinations);
      return rows;
    }

    rows.push(...filteredNav);

    resources.forEach((r, index) => {
      rows.push({
        id: `resource:${r.id}`,
        kind: 'resource',
        label: r.title,
        type: r.type,
        sublabel: r.updated_at ? formatDistanceToNow(r.updated_at * 1000) : undefined,
        icon: (
          <DomeResourceIcon type={r.type} name={r.title} size={16} className="size-4 shrink-0" strokeWidth={1.5} />
        ),
        run: () => openResource(r, filteredNav.length + index + 1, 'resource'),
      });
    });

    interactions.forEach((r, index) => {
      rows.push({
        id: `interaction:${r.id}:${index}`,
        kind: 'interaction',
        label: r.title,
        type: r.type,
        sublabel: t('command.notes_annotations'),
        icon: (
          <DomeResourceIcon type={r.type} name={r.title} size={16} className="size-4 shrink-0" strokeWidth={1.5} />
        ),
        run: () => openResource(r, filteredNav.length + resources.length + index + 1, 'interaction'),
      });
    });

    return rows;
  }, [filteredNav, interactions, navigationDestinations, openResource, quickActions, resources, t, trimmedQuery]);

  const { selectedIndex, setSelectedIndex } = useMenuNavigation({
    containerRef: panelRef,
    query: trimmedQuery,
    items: flatRows,
    onSelect: (row) => row.run(),
    onClose: close,
  });

  useEffect(() => {
    if (selectedIndex === undefined || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-palette-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  const showEmptyQuery = !trimmedQuery;
  const hasResults = flatRows.length > 0;
  const showNoResults = Boolean(trimmedQuery) && !isSearching && !hasResults;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
      style={{
        background: 'color-mix(in srgb, var(--dome-bg) 55%, transparent)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
      role="presentation"
    >
      <dialog
        ref={panelRef}
        open
        className="w-full max-w-xl overflow-hidden rounded-2xl border shadow-2xl m-0 max-h-none p-0"
        style={{
          background: 'var(--dome-bg)',
          borderColor: 'var(--dome-border)',
          boxShadow: '0 24px 80px color-mix(in srgb, var(--dome-bg) 40%, transparent)',
        }}
        aria-label={t('command.palette_title')}
      >
        <div
          className="flex items-center gap-3 border-b px-4 py-3.5"
          style={{ borderColor: 'var(--dome-border)' }}
        >
          <Search className="size-4 shrink-0" strokeWidth={1.5} style={{ color: 'var(--dome-text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('command.palette_placeholder')}
            aria-label={t('command.palette_placeholder')}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--dome-text)' }}
            autoComplete="off"
            spellCheck={false}
          />
          {isSearching ? (
            <div
              className="size-4 shrink-0 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: 'var(--dome-accent)', borderTopColor: 'transparent' }}
            />
          ) : null}
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="rounded p-0.5 hover:bg-[var(--dome-surface)]"
              aria-label={t('command.clear_search')}
            >
              <X className="size-4" strokeWidth={1.5} style={{ color: 'var(--dome-text-muted)' }} />
            </button>
          ) : null}
          <kbd
            className="hidden rounded border px-1.5 py-0.5 text-[10px] font-medium sm:inline"
            style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)', background: 'var(--dome-surface)' }}
          >
            {modKeyLabel()}
          </kbd>
        </div>

        <CommandPaletteResultsList
          showEmptyQuery={showEmptyQuery}
          showNoResults={showNoResults}
          trimmedQuery={trimmedQuery}
          quickActions={quickActions}
          navigationDestinations={navigationDestinations}
          filteredNav={filteredNav}
          resources={resources}
          interactions={interactions}
          flatRows={flatRows}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          listRef={listRef}
        />

        <div
          className="flex items-center justify-between border-t px-4 py-2 text-[11px]"
          style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
        >
          <span>{t('command.palette_hint')}</span>
          <span>{t('command.palette_esc')}</span>
        </div>
      </dialog>
    </div>
  );
}
