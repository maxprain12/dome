import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
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
import CommandPaletteResourcePreview from './CommandPaletteResourcePreview';
import { Command, CommandInput } from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

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
  const [addUrlOpen, setAddUrlOpen] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [urlSubmitting, setUrlSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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

  const createUrlResource = useCallback(async () => {
    const rawUrl = urlValue.trim();
    if (!rawUrl || !window.electron?.db?.resources?.create) return;
    const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    setUrlSubmitting(true);
    try {
      const now = Date.now();
      const id = `res_${now}_${Math.random().toString(36).slice(2, 11)}`;
      const title = normalizedUrl.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0] || normalizedUrl;
      const result = await window.electron.db.resources.create({
        id,
        type: 'url',
        title,
        project_id: projectId,
        content: normalizedUrl,
        created_at: now,
        updated_at: now,
      });
      if (result.success && result.data) {
        openResourceTab(result.data.id, 'url', result.data.title, projectId);
      }
      setAddUrlOpen(false);
      setUrlValue('');
    } finally {
      setUrlSubmitting(false);
    }
  }, [openResourceTab, projectId, urlValue]);

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
        requestAddUrl: () => setAddUrlOpen(true),
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
        resourceId: r.id,
        sublabel: r.updated_at ? formatDistanceToNow(r.updated_at * 1000) : undefined,
        run: () => openResource(r, filteredNav.length + index + 1, 'resource'),
      });
    });

    interactions.forEach((r, index) => {
      rows.push({
        id: `interaction:${r.id}:${index}`,
        kind: 'interaction',
        label: r.title,
        type: r.type,
        resourceId: r.id,
        sublabel: t('command.notes_annotations'),
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

  const showEmptyQuery = !trimmedQuery;
  const hasResults = flatRows.length > 0;
  const showNoResults = Boolean(trimmedQuery) && !isSearching && !hasResults;

  // Preview pane: stable while arrowing (falls back to the first result when
  // a nav row is selected) so the dialog width doesn't flicker.
  const selectedRow = selectedIndex !== undefined ? flatRows[selectedIndex] : undefined;
  const hasResourceResults = Boolean(trimmedQuery) && (resources.length > 0 || interactions.length > 0);
  const previewResourceId = hasResourceResults
    ? (selectedRow && 'resourceId' in selectedRow ? selectedRow.resourceId : resources[0]?.id ?? interactions[0]?.id ?? null)
    : null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(next) => { if (!next) close(); }}>
        <DialogContent
          ref={panelRef}
          className={`top-[12vh] w-full translate-y-0 gap-0 overflow-hidden rounded-2xl border-border p-0 shadow-2xl animate-none data-open:animate-none data-closed:animate-none ${previewResourceId ? 'sm:max-w-3xl' : 'sm:max-w-xl'}`}
          showCloseButton={false}
          aria-label={t('command.palette_title')}
        >
          <DialogTitle className="sr-only">{t('command.palette_title')}</DialogTitle>
          <Command shouldFilter={false} className="rounded-none p-0">
            <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={t('command.palette_placeholder')}
            aria-label={t('command.palette_placeholder')}
            autoComplete="off"
            spellCheck={false}
          />
            <div className="flex min-h-0 border-t">
              <div className="min-w-0 flex-1">
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
              </div>
              {previewResourceId ? (
                <div className="hidden w-[290px] shrink-0 overflow-hidden border-l bg-muted/30 sm:block">
                  <CommandPaletteResourcePreview resourceId={previewResourceId} query={trimmedQuery} />
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-between border-t px-4 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-2">
                {isSearching ? <Spinner className="size-3" /> : null}
                {t('command.palette_hint')}
              </span>
              <span>{modKeyLabel()} · {t('command.palette_esc')}</span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>

      <Dialog open={addUrlOpen} onOpenChange={setAddUrlOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('command.add_url')}</DialogTitle>
            <DialogDescription>{t('command.please_enter_url')}</DialogDescription>
          </DialogHeader>
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              void createUrlResource();
            }}
          >
            <Field>
              <FieldLabel htmlFor="command-add-url">URL</FieldLabel>
              <Input
                id="command-add-url"
                type="url"
                value={urlValue}
                onChange={(event) => setUrlValue(event.target.value)}
                placeholder="https://example.com"
              />
              <FieldDescription>{t('command.add_url')}</FieldDescription>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddUrlOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={urlSubmitting} disabled={!urlValue.trim()}>
                {t('command.add_url')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
