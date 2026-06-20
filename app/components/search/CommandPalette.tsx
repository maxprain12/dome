import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Search,
  Plus,
  Upload,
  Link2,
  X,
  Home,
  Calendar,
  Settings,
  Bot,
  Workflow,
  Zap,
  Activity,
  Layers,
  BookOpen,
  Tag,
  Store,
  Mail,
  ListTodo,
  ArrowRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import DomeResourceIcon from '@/components/ui/DomeResourceIcon';
import { useMenuNavigation } from '@/hooks/use-menu-navigation';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore, HOME_TAB_ID } from '@/lib/store/useTabStore';
import { useFeaturesStore } from '@/lib/store/useFeaturesStore';
import { isFeatureVisible } from '@/lib/features/featureKeys';
import { orderUnifiedResourcesByHybrid } from '@/lib/search/hybrid-search';
import { recordSearchResultSelected } from '@/lib/search/search-signals';
import { formatDistanceToNow } from '@/lib/utils';

type PaletteKind = 'nav' | 'action' | 'resource' | 'interaction';

interface PaletteRow {
  id: string;
  kind: PaletteKind;
  label: string;
  sublabel?: string;
  type?: string;
  icon: ReactNode;
  run: () => void;
}

interface SearchResourceRow {
  id: string;
  title: string;
  type: string;
  updated_at?: number;
}

function modKeyLabel(): string {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)) {
    return '⌘K';
  }
  return 'Ctrl+K';
}

function matchesQuery(label: string, query: string): boolean {
  return label.toLowerCase().includes(query.toLowerCase());
}

export default function CommandPalette() {
  const { t } = useTranslation();
  const currentProject = useAppStore((s) => s.currentProject);
  const setSection = useAppStore((s) => s.setHomeSidebarSection);
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
    openTagsTab,
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
      openTagsTab: s.openTagsTab,
      openMarketplaceTab: s.openMarketplaceTab,
      openAgentsTab: s.openAgentsTab,
      openWorkflowsTab: s.openWorkflowsTab,
      openAutomationsTab: s.openAutomationsTab,
      openRunsTab: s.openRunsTab,
    })),
  );

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [resources, setResources] = useState<SearchResourceRow[]>([]);
  const [interactions, setInteractions] = useState<SearchResourceRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!featuresLoaded) void loadFeatures();
  }, [featuresLoaded, loadFeatures]);

  const navVisible = useCallback(
    (key: string) => isFeatureVisible(featureVisibility, key),
    [featureVisibility],
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setResources([]);
    setInteractions([]);
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setResources([]);
    setInteractions([]);
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => {
          if (prev) {
            setQuery('');
            setResources([]);
            setInteractions([]);
            return false;
          }
          setQuery('');
          setResources([]);
          setInteractions([]);
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
  }, [open]);

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
    setSection('library');
    activateTab(HOME_TAB_ID);
  }, [activateTab, setSection]);

  const openResource = useCallback(
    (resource: { id: string; type: string; title: string }, rank1Indexed: number, category: string) => {
      recordSearchResultSelected({
        surface: 'cmdk_modal',
        query: query.trim(),
        selectedId: resource.id,
        rank1Indexed,
        category,
      });
      if (resource.type === 'folder') {
        openFolderTab(resource.id, resource.title);
      } else {
        openResourceTab(resource.id, resource.type, resource.title);
      }
      close();
    },
    [close, openFolderTab, openResourceTab, query],
  );

  const navigationDestinations = useMemo((): PaletteRow[] => {
    const sw = 1.75;
    const iconClass = 'size-4 shrink-0';
    const wrap = (key: string, label: string, icon: ReactNode, run: () => void): PaletteRow => ({
      id: `nav:${key}`,
      kind: 'nav',
      label,
      icon,
      run: () => {
        run();
        close();
      },
    });

    const items: Array<{ key: string; row: PaletteRow }> = [
      {
        key: 'library',
        row: wrap(
          'library',
          t('workspace.home'),
          <Home className={iconClass} strokeWidth={sw} />,
          goHome,
        ),
      },
      {
        key: 'projects',
        row: wrap(
          'projects',
          t('tabs.projects'),
          <Layers className={iconClass} strokeWidth={sw} />,
          openProjectsTab,
        ),
      },
      {
        key: 'calendar',
        row: wrap(
          'calendar',
          t('workspace.calendar'),
          <Calendar className={iconClass} strokeWidth={sw} />,
          openCalendarTab,
        ),
      },
      {
        key: 'github',
        row: wrap(
          'github',
          t('github.tab_title'),
          <ListTodo className={iconClass} strokeWidth={sw} />,
          openGitHubTab,
        ),
      },
      {
        key: 'email',
        row: wrap(
          'email',
          t('email.tab_title'),
          <Mail className={iconClass} strokeWidth={sw} />,
          openEmailTab,
        ),
      },
      {
        key: 'agents',
        row: wrap(
          'agents',
          t('automationHub.tab_agents'),
          <Bot className={iconClass} strokeWidth={sw} />,
          openAgentsTab,
        ),
      },
      {
        key: 'workflows',
        row: wrap(
          'workflows',
          t('automationHub.tab_workflows'),
          <Workflow className={iconClass} strokeWidth={sw} />,
          openWorkflowsTab,
        ),
      },
      {
        key: 'automations',
        row: wrap(
          'automations',
          t('automationHub.tab_automations'),
          <Zap className={iconClass} strokeWidth={sw} />,
          openAutomationsTab,
        ),
      },
      {
        key: 'runs',
        row: wrap(
          'runs',
          t('automationHub.tab_runs'),
          <Activity className={iconClass} strokeWidth={sw} />,
          openRunsTab,
        ),
      },
      {
        key: 'learn',
        row: wrap(
          'learn',
          t('workspace.learn'),
          <BookOpen className={iconClass} strokeWidth={sw} />,
          openLearnTab,
        ),
      },
      {
        key: 'tags',
        row: wrap(
          'tags',
          t('workspace.tags'),
          <Tag className={iconClass} strokeWidth={sw} />,
          openTagsTab,
        ),
      },
      {
        key: 'marketplace',
        row: wrap(
          'marketplace',
          t('workspace.marketplace'),
          <Store className={iconClass} strokeWidth={sw} />,
          openMarketplaceTab,
        ),
      },
      {
        key: 'settings',
        row: wrap(
          'settings',
          t('settings.title'),
          <Settings className={iconClass} strokeWidth={sw} />,
          openSettingsTab,
        ),
      },
    ];

    return items
      .filter(({ key }) => key === 'library' || key === 'settings' || navVisible(key))
      .map(({ row }) => row);
  }, [
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
    openTagsTab,
    openWorkflowsTab,
    t,
  ]);

  const quickActions = useMemo((): PaletteRow[] => {
    const sw = 1.75;
    const iconClass = 'size-4 shrink-0';
    const projectId = currentProject?.id ?? 'default';

    const wrapAction = (id: string, label: string, icon: ReactNode, run: () => void | Promise<void>): PaletteRow => ({
      id: `action:${id}`,
      kind: 'action',
      label,
      icon,
      run: () => {
        void Promise.resolve(run()).finally(close);
      },
    });

    return [
      wrapAction(
        'new-note',
        t('command.new_note'),
        <Plus className={iconClass} strokeWidth={sw} style={{ color: 'var(--dome-accent)' }} />,
        async () => {
          if (!window.electron?.db?.resources?.create) return;
          const now = Date.now();
          const res = {
            id: `res_${now}_${Math.random().toString(36).slice(2, 11)}`,
            type: 'note' as const,
            title: t('dashboard.untitled_note'),
            content: '',
            project_id: projectId,
            created_at: now,
            updated_at: now,
          };
          const result = await window.electron.db.resources.create(res);
          if (result.success && result.data) {
            openResourceTab(result.data.id, 'note', result.data.title);
          }
        },
      ),
      wrapAction(
        'upload',
        t('command.upload_files'),
        <Upload className={iconClass} strokeWidth={sw} style={{ color: 'var(--dome-accent)' }} />,
        async () => {
          if (!window.electron?.selectFiles || !window.electron?.resource?.importMultiple) return;
          const paths = await window.electron.selectFiles({ properties: ['openFile', 'multiSelections'] });
          if (paths?.length) {
            await window.electron.resource.importMultiple(paths, projectId);
          }
        },
      ),
      wrapAction(
        'add-url',
        t('command.add_url'),
        <Link2 className={iconClass} strokeWidth={sw} style={{ color: 'var(--dome-accent)' }} />,
        async () => {
          const url = prompt(t('command.please_enter_url'));
          if (!url || !window.electron?.db?.resources?.create) return;
          const now = Date.now();
          const id = `res_${now}_${Math.random().toString(36).slice(2, 11)}`;
          const title = url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] ?? url;
          await window.electron.db.resources.create({
            id,
            type: 'url',
            title,
            project_id: projectId,
            content: url,
            created_at: now,
            updated_at: now,
          });
        },
      ),
    ];
  }, [close, currentProject?.id, openResourceTab, t]);

  const trimmedQuery = query.trim();
  const filteredNav = useMemo(() => {
    if (!trimmedQuery) return navigationDestinations;
    return navigationDestinations.filter((row) => matchesQuery(row.label, trimmedQuery));
  }, [navigationDestinations, trimmedQuery]);

  useEffect(() => {
    if (!isOpen || !trimmedQuery) {
      setResources([]);
      setInteractions([]);
      return;
    }

    let ignore = false;
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        if (!window.electron?.db?.search?.unified) return;
        const result = await window.electron.db.search.unified(trimmedQuery);
        if (ignore || !result.success || !result.data) return;

        if (Array.isArray(result.data.resources) && result.data.resources.length > 0) {
          const ordered = await orderUnifiedResourcesByHybrid(trimmedQuery, result.data.resources, {
            mergeTake: 12,
          });
          if (!ignore) {
            setResources(
              ordered.slice(0, 8).map((r) => ({
                id: r.id,
                title: r.title || t('folder.untitled', 'Sin título'),
                type: r.type || 'note',
                updated_at: r.updated_at,
              })),
            );
          }
        } else if (!ignore) {
          setResources([]);
        }

        if (Array.isArray(result.data.interactions) && result.data.interactions.length > 0) {
          if (!ignore) {
            setInteractions(
              result.data.interactions.slice(0, 4).map((i: {
                id: string;
                type?: string;
                resource_id?: string;
                resource_title?: string;
                updated_at?: number;
                created_at?: number;
              }) => ({
                id: i.resource_id || i.id,
                title: i.resource_title || t('folder.untitled', 'Sin título'),
                type: i.type || 'note',
                updated_at: i.updated_at ?? i.created_at,
              })),
            );
          }
        } else if (!ignore) {
          setInteractions([]);
        }
      } catch (err) {
        console.error('[CommandPalette] search failed:', err);
      } finally {
        if (!ignore) setIsSearching(false);
      }
    }, 200);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, trimmedQuery, t]);

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
        sublabel: r.updated_at
          ? formatDistanceToNow(r.updated_at * 1000)
          : undefined,
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
  const showNoResults = trimmedQuery && !isSearching && !hasResults;

  let runningIndex = -1;
  const nextIndex = () => {
    runningIndex += 1;
    return runningIndex;
  };

  const renderRow = (row: PaletteRow) => {
    const idx = nextIndex();
    const isSelected = selectedIndex === idx;
    return (
      <button
        key={row.id}
        type="button"
        data-palette-index={idx}
        onMouseEnter={() => setSelectedIndex(idx)}
        onClick={() => row.run()}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
        style={{
          background: isSelected ? 'var(--dome-surface)' : 'transparent',
          color: 'var(--dome-text)',
        }}
      >
        <span style={{ color: row.kind === 'nav' ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }}>
          {row.icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{row.label}</span>
        {row.sublabel ? (
          <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--dome-text-muted)' }}>
            {row.sublabel}
          </span>
        ) : null}
        {row.kind === 'nav' ? (
          <ArrowRight className="size-3.5 shrink-0 opacity-40" strokeWidth={1.5} />
        ) : null}
      </button>
    );
  };

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
      <div
        ref={panelRef}
        className="w-full max-w-xl overflow-hidden rounded-2xl border shadow-2xl"
        style={{
          background: 'var(--dome-bg)',
          borderColor: 'var(--dome-border)',
          boxShadow: '0 24px 80px color-mix(in srgb, var(--dome-bg) 40%, transparent)',
        }}
        role="dialog"
        aria-modal="true"
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

        <div ref={listRef} className="max-h-[min(420px,55vh)] overflow-y-auto p-2">
          {showEmptyQuery ? (
            <>
              <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--dome-text-muted)' }}>
                {t('command.quick_actions')}
              </p>
              <div className="mb-2 flex flex-col gap-0.5">
                {quickActions.map((row) => renderRow(row))}
              </div>
              <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--dome-text-muted)' }}>
                {t('command.navigate')}
              </p>
              <div className="flex flex-col gap-0.5">
                {navigationDestinations.map((row) => renderRow(row))}
              </div>
            </>
          ) : null}

          {!showEmptyQuery && filteredNav.length > 0 ? (
            <>
              <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--dome-text-muted)' }}>
                {t('command.navigate')}
              </p>
              <div className="mb-2 flex flex-col gap-0.5">
                {filteredNav.map((row) => renderRow(row))}
              </div>
            </>
          ) : null}

          {!showEmptyQuery && resources.length > 0 ? (
            <>
              <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--dome-text-muted)' }}>
                {t('command.resources')}
              </p>
              <div className="mb-2 flex flex-col gap-0.5">
                {resources.map((r) => {
                  const row = flatRows.find((x) => x.id === `resource:${r.id}`);
                  return row ? renderRow(row) : null;
                })}
              </div>
            </>
          ) : null}

          {!showEmptyQuery && interactions.length > 0 ? (
            <>
              <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--dome-text-muted)' }}>
                {t('command.notes_annotations')}
              </p>
              <div className="flex flex-col gap-0.5">
                {interactions.map((r, index) => {
                  const row = flatRows.find((x) => x.id === `interaction:${r.id}:${index}`);
                  return row ? renderRow(row) : null;
                })}
              </div>
            </>
          ) : null}

          {showNoResults ? (
            <div className="px-4 py-10 text-center">
              <Search className="mx-auto mb-2 size-7" strokeWidth={1.5} style={{ color: 'var(--dome-text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                {t('command.no_results', { query: trimmedQuery })}
              </p>
            </div>
          ) : null}
        </div>

        <div
          className="flex items-center justify-between border-t px-4 py-2 text-[11px]"
          style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
        >
          <span>{t('command.palette_hint')}</span>
          <span>{t('command.palette_esc')}</span>
        </div>
      </div>
    </div>
  );
}
