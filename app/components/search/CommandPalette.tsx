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
import { focusEmail, focusGithubIssue, focusSocialPost } from '@/lib/store/useOpenIntentStore';
import { buildNavigationDestinations, buildQuickActions } from './commandPaletteNav';
import {
  matchesQuery,
  metaString,
  modKeyLabel,
  rowPassesFilter,
  sourcesByKind,
  type PaletteFilter,
  type PalettePreviewTarget,
  type PaletteRow,
  type SourceHitRow,
} from './commandPaletteTypes';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Mail01Icon,
  Share08Icon,
  Task01Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';

function issueSublabel(hit: SourceHitRow, t: (key: string, opts?: Record<string, string>) => string): string {
  const repo = metaString(hit.meta, 'fullName') || t('command.find_task_fallback');
  const state = metaString(hit.meta, 'state');
  if (state === 'closed') return t('command.find_task_done', { repo });
  return t('command.find_task_open', { repo });
}

function emailSublabel(hit: SourceHitRow, t: (key: string, opts?: Record<string, string>) => string): string {
  const folder = metaString(hit.meta, 'folder');
  if (folder) return t('command.find_email_folder', { folder });
  return hit.snippet || t('command.find_email_fallback');
}

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
    openSocialTab,
    openProjectsTab,
    openLearnTab,
    openMarketplaceTab,
    openPipelinesTab,
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
      openSocialTab: s.openSocialTab,
      openProjectsTab: s.openProjectsTab,
      openLearnTab: s.openLearnTab,
      openMarketplaceTab: s.openMarketplaceTab,
      openPipelinesTab: s.openPipelinesTab,
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
  const [filter, setFilter] = useState<PaletteFilter>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const projectId = currentProject?.id ?? 'default';
  const { searchState, trimmedQuery, setQuery, resetSearch } = useCommandPaletteSearch(isOpen, projectId, t);
  const { query, resources, interactions, sources, isSearching } = searchState;

  useEffect(() => {
    if (!featuresLoaded) void loadFeatures();
  }, [featuresLoaded, loadFeatures]);

  const navVisible = useCallback(
    (key: string) => isFeatureVisible(featureVisibility, key),
    [featureVisibility],
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setFilter('all');
    resetSearch();
  }, [resetSearch]);

  const open = useCallback(() => {
    setIsOpen(true);
    setFilter('all');
    resetSearch();
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [resetSearch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => {
          if (prev) {
            setFilter('all');
            resetSearch();
            return false;
          }
          setFilter('all');
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
        openPipelinesTab,
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
      openPipelinesTab,
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

  const peopleHits = useMemo(() => sourcesByKind(sources, 'person'), [sources]);
  const issueHits = useMemo(() => sourcesByKind(sources, 'issue'), [sources]);
  const emailHits = useMemo(() => sourcesByKind(sources, 'email'), [sources]);
  const socialHits = useMemo(() => sourcesByKind(sources, 'social_post'), [sources]);

  const flatRows = useMemo((): PaletteRow[] => {
    const rows: PaletteRow[] = [];

    if (!trimmedQuery) {
      rows.push(...quickActions, ...navigationDestinations);
      return rows;
    }

    for (const row of filteredNav) {
      if (rowPassesFilter(row.kind, filter)) rows.push(row);
    }

    if (rowPassesFilter('resource', filter)) {
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
    }

    if (rowPassesFilter('interaction', filter)) {
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
    }

    if (rowPassesFilter('person', filter)) {
      peopleHits.forEach((hit) => {
        rows.push({
          id: `person:${hit.id}`,
          kind: 'person',
          icon: UserIcon,
          label: hit.title,
          sublabel: hit.snippet || t('command.people'),
          sourceId: hit.id,
          meta: hit.meta,
          snippet: hit.snippet,
          run: () => {
            const identities = (hit.meta?.identities as Array<{ source?: string }> | undefined) || [];
            if (identities.some((i) => i.source === 'github')) openGitHubTab();
            else if (identities.some((i) => i.source === 'email')) openEmailTab();
            else openSocialTab();
            close();
          },
        });
      });
    }

    if (rowPassesFilter('issue', filter)) {
      issueHits.forEach((hit) => {
        rows.push({
          id: `issue:${hit.id}`,
          kind: 'issue',
          icon: Task01Icon,
          label: hit.title,
          sublabel: issueSublabel(hit, t),
          sourceId: hit.id,
          meta: hit.meta,
          snippet: hit.snippet,
          run: () => {
            const repoId = metaString(hit.meta, 'repoId');
            openGitHubTab();
            focusGithubIssue({ issueId: hit.id, ...(repoId ? { repoId } : {}) });
            close();
          },
        });
      });
    }

    if (rowPassesFilter('email', filter)) {
      emailHits.forEach((hit) => {
        rows.push({
          id: `email:${hit.id}`,
          kind: 'email',
          icon: Mail01Icon,
          label: hit.title,
          sublabel: emailSublabel(hit, t),
          sourceId: hit.id,
          meta: hit.meta,
          snippet: hit.snippet,
          run: () => {
            openEmailTab();
            focusEmail({
              sourceId: hit.id,
              accountId: metaString(hit.meta, 'accountId'),
              folder: metaString(hit.meta, 'folder'),
              uid: hit.meta?.uid as string | number | undefined,
            });
            close();
          },
        });
      });
    }

    if (rowPassesFilter('social_post', filter)) {
      socialHits.forEach((hit) => {
        rows.push({
          id: `social:${hit.id}`,
          kind: 'social_post',
          icon: Share08Icon,
          label: hit.title,
          sublabel: hit.snippet || t('command.social_posts'),
          sourceId: hit.id,
          meta: hit.meta,
          snippet: hit.snippet,
          run: () => {
            openSocialTab();
            focusSocialPost({ postId: hit.id });
            close();
          },
        });
      });
    }

    return rows;
  }, [
    close,
    emailHits,
    filter,
    filteredNav,
    interactions,
    issueHits,
    navigationDestinations,
    openEmailTab,
    openGitHubTab,
    openResource,
    openSocialTab,
    peopleHits,
    quickActions,
    resources,
    socialHits,
    t,
    trimmedQuery,
  ]);

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

  const selectedRow = selectedIndex !== undefined ? flatRows[selectedIndex] : undefined;

  const previewTarget = useMemo((): PalettePreviewTarget | null => {
    if (!trimmedQuery) return null;

    const fromRow = (row: PaletteRow | undefined): PalettePreviewTarget | null => {
      if (!row) return null;
      if (row.kind === 'resource' || row.kind === 'interaction') {
        return { kind: 'resource', resourceId: row.resourceId };
      }
      if (
        row.kind === 'issue' ||
        row.kind === 'email' ||
        row.kind === 'person' ||
        row.kind === 'social_post'
      ) {
        return {
          kind: 'source',
          hit: {
            kind: row.kind,
            id: row.sourceId ?? row.id,
            title: row.label,
            snippet: row.snippet,
            meta: row.meta ?? null,
          },
        };
      }
      return null;
    };

    const selected = fromRow(selectedRow);
    if (selected) return selected;

    if (rowPassesFilter('resource', filter) && resources[0]) {
      return { kind: 'resource', resourceId: resources[0].id };
    }
    if (rowPassesFilter('interaction', filter) && interactions[0]) {
      return { kind: 'resource', resourceId: interactions[0].id };
    }
    if (rowPassesFilter('issue', filter) && issueHits[0]) {
      return { kind: 'source', hit: issueHits[0] };
    }
    if (rowPassesFilter('email', filter) && emailHits[0]) {
      return { kind: 'source', hit: emailHits[0] };
    }
    if (rowPassesFilter('person', filter) && peopleHits[0]) {
      return { kind: 'source', hit: peopleHits[0] };
    }
    if (rowPassesFilter('social_post', filter) && socialHits[0]) {
      return { kind: 'source', hit: socialHits[0] };
    }
    return null;
  }, [
    emailHits,
    filter,
    interactions,
    issueHits,
    peopleHits,
    resources,
    selectedRow,
    socialHits,
    trimmedQuery,
  ]);

  const filterOptions: Array<{ value: PaletteFilter; label: string }> = [
    { value: 'all', label: t('command.find_filter_all') },
    { value: 'resources', label: t('command.find_filter_resources') },
    { value: 'tasks', label: t('command.find_filter_tasks') },
    { value: 'mail', label: t('command.find_filter_mail') },
    { value: 'people', label: t('command.find_filter_people') },
    { value: 'social', label: t('command.find_filter_social') },
  ];

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(next) => { if (!next) close(); }}>
        <DialogContent
          className={`top-[12vh] bottom-auto w-full gap-0 overflow-hidden rounded-2xl border-border p-0 shadow-2xl animate-none data-open:animate-none data-closed:animate-none ${previewTarget ? 'sm:max-w-3xl' : 'sm:max-w-xl'}`}
          showCloseButton={false}
          aria-label={t('command.palette_title')}
        >
          <div ref={panelRef} className="contents">
          <DialogTitle className="sr-only">{t('command.palette_title')}</DialogTitle>
          <Command shouldFilter={false} className="rounded-none p-0">
            <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={t('command.palette_placeholder')}
            aria-label={t('command.palette_placeholder')}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            name="dome-command-search"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
          />
            {trimmedQuery ? (
              <div className="border-t px-3 py-2">
                <ToggleGroup
                  value={[filter]}
                  onValueChange={(values) => {
                    const next = values[0] as PaletteFilter | undefined;
                    if (next) setFilter(next);
                  }}
                  variant="outline"
                  size="sm"
                  className="flex flex-wrap justify-start gap-1"
                  aria-label={t('command.find_filters')}
                >
                  {filterOptions.map((opt) => (
                    <ToggleGroupItem key={opt.value} value={opt.value} className="px-2.5 text-xs">
                      {opt.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            ) : null}
            <div className="flex min-h-0 border-t">
              <div className="min-w-0 flex-1">
                <CommandPaletteResultsList
                  showEmptyQuery={showEmptyQuery}
                  showNoResults={showNoResults}
                  trimmedQuery={trimmedQuery}
                  filter={filter}
                  quickActions={quickActions}
                  navigationDestinations={navigationDestinations}
                  filteredNav={filteredNav.filter((row) => rowPassesFilter(row.kind, filter))}
                  resources={rowPassesFilter('resource', filter) ? resources : []}
                  interactions={rowPassesFilter('interaction', filter) ? interactions : []}
                  peopleHits={rowPassesFilter('person', filter) ? peopleHits : []}
                  issueHits={rowPassesFilter('issue', filter) ? issueHits : []}
                  emailHits={rowPassesFilter('email', filter) ? emailHits : []}
                  socialHits={rowPassesFilter('social_post', filter) ? socialHits : []}
                  flatRows={flatRows}
                  selectedIndex={selectedIndex}
                  setSelectedIndex={setSelectedIndex}
                  listRef={listRef}
                />
              </div>
              {previewTarget ? (
                <div className="hidden w-[290px] shrink-0 overflow-hidden border-l bg-muted/30 sm:block">
                  <CommandPaletteResourcePreview target={previewTarget} query={trimmedQuery} />
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
          </div>
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
