import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
const CloudFilePicker = lazy(() => import('@/components/cloud/CloudFilePicker'));
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Activity01Icon,
  BookOpen01Icon,
  BotIcon,
  Calendar03Icon,
  ChevronDownIcon,
  FolderAddIcon,
  FolderSymlinkIcon,
  GitBranchIcon,
  Home01Icon,
  Layers01Icon,
  Login01Icon,
  Mail01Icon,
  MoonIcon,
  PlusSignIcon,
  RefreshIcon,
  Settings01Icon,
  Share08Icon,
  Store01Icon,
  Sun03Icon,
  Task01Icon,
  WorkflowSquare01Icon,
  ZapIcon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { selectionSurfaceClass } from '@/components/shared/selectionSurface';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore, type TabType } from '@/lib/store/useTabStore';
import type { Resource } from '@/lib/hooks/useResources';
import type { Project } from '@/types';
import { showToast } from '@/lib/store/useToastStore';
import { useFeaturesStore, useHiddenFeatureCount } from '@/lib/store/useFeaturesStore';
import { isFeatureVisible } from '@/lib/features/featureKeys';
import { useDomeSession } from '@/lib/hooks/useDomeSession';

// ---------------------------------------------------------------------------
// Folder colors — central palette in app/lib/ui/palettes.ts (persisted in DB)
// ---------------------------------------------------------------------------

// Subcomponentes extraídos (03/T02) — misma UI, archivos en ./sidebar/.
import { parseMeta } from './sidebar/sidebarHelpers';
import FileTree from './sidebar/SidebarFileTree';
import { NewFolderModal, UrlInputModal } from './sidebar/SidebarModals';
import AddResourceMenu from './sidebar/AddResourceMenu';
import ShellProjectPicker from '@/components/shell/ShellProjectPicker';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface UnifiedSidebarProps {
  collapsed: boolean;
}

/** Icon + label navigation row used throughout the sidebar (primary + secondary sections). */
function SidebarNavButton({
  icon,
  label,
  active,
  count,
  dataTour,
  onClick,
}: {
  icon: IconSvgElement;
  label: string;
  active?: boolean;
  count?: number;
  dataTour?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-tour={dataTour}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left text-xs font-medium',
        selectionSurfaceClass(Boolean(active)),
        !active && 'text-sidebar-foreground/80',
      )}
      data-active={active ? 'true' : undefined}
    >
      <HugeiconsIcon icon={icon} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? (
        <span className="shrink-0 rounded-full bg-sidebar-accent px-1.5 text-[10px] tabular-nums text-sidebar-accent-foreground/80">
          {count}
        </span>
      ) : null}
    </button>
  );
}

export default function UnifiedSidebar({ collapsed }: UnifiedSidebarProps) {
  const { t } = useTranslation();
  const [resources, setResources] = useState<Resource[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [showCloudPicker, setShowCloudPicker] = useState(false);
  const [newFolderInWorkspace, setNewFolderInWorkspace] = useState(false);

  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!window.electron?.updater?.onStatus) return;
    const unsub = window.electron.updater.onStatus((s: { status: string }) => {
      setUpdateAvailable(s.status === 'available' || s.status === 'downloaded');
    });
    return unsub;
  }, []);

  const theme = useAppStore((s) => s.theme);
  const updateTheme = useAppStore((s) => s.updateTheme);
  const currentProject = useAppStore((s) => s.currentProject);
  const hubProjectId = currentProject?.id ?? 'default';
  const activeProjectLabel =
    currentProject?.name ?? projects.find((p) => p.id === hubProjectId)?.name ?? 'Dome';
  const activeSection = useAppStore((s) => s.homeSidebarSection);
  const setSection = useAppStore((s) => s.setHomeSidebarSection);
  const {
    openSettingsTab,
    openCalendarTab,
    openGitHubTab,
    openEmailTab,
    openSocialTab,
    openProjectsTab,
    openLearnTab,
    openPipelinesTab,
    openAgentsTab,
    openWorkflowsTab,
    openAutomationsTab,
    openRunsTab,
    openMarketplaceTab,
    openFolderTab,
    activeTabId,
    tabs,
  } = useTabStore(
    useShallow((s) => ({
      openSettingsTab: s.openSettingsTab,
      openCalendarTab: s.openCalendarTab,
      openGitHubTab: s.openGitHubTab,
      openEmailTab: s.openEmailTab,
      openSocialTab: s.openSocialTab,
      openProjectsTab: s.openProjectsTab,
      openLearnTab: s.openLearnTab,
      openPipelinesTab: s.openPipelinesTab,
      openAgentsTab: s.openAgentsTab,
      openWorkflowsTab: s.openWorkflowsTab,
      openAutomationsTab: s.openAutomationsTab,
      openRunsTab: s.openRunsTab,
      openMarketplaceTab: s.openMarketplaceTab,
      openFolderTab: s.openFolderTab,
      activeTabId: s.activeTabId,
      tabs: s.tabs,
    })),
  );

  // Feature visibility (role-based). Load once; filter nav items by it.
  const featureVisibility = useFeaturesStore((s) => s.visibility);
  const featuresLoaded = useFeaturesStore((s) => s.loaded);
  const loadFeatures = useFeaturesStore((s) => s.loadFeatures);
  const hiddenFeatureCount = useHiddenFeatureCount();
  const domeSession = useDomeSession();
  const [connectingAccount, setConnectingAccount] = useState(false);
  const showSignInCta = !domeSession.loading && !domeSession.connected;

  const handleSignIn = useCallback(async () => {
    if (!window.electron?.domeAuth?.startOAuthFlow) return;
    setConnectingAccount(true);
    try {
      const result = await window.electron.domeAuth.startOAuthFlow();
      if (result.success) {
        showToast('success', t('sidebar.sign_in_success'));
        await domeSession.refresh();
      } else if (result.error) {
        showToast('error', result.error);
      }
    } catch {
      showToast('error', t('sidebar.sign_in_error'));
    } finally {
      setConnectingAccount(false);
    }
  }, [domeSession, t]);

  useEffect(() => {
    if (!featuresLoaded) void loadFeatures();
  }, [featuresLoaded, loadFeatures]);
  const navItemVisible = useCallback(
    (key: string) => isFeatureVisible(featureVisibility, key),
    [featureVisibility],
  );
  const goToFeatureSettings = useCallback(() => {
    openSettingsTab();
    // SettingsPage listens for this to jump to the Features panel.
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('dome:goto-settings-section', { detail: 'features' }));
    }, 50);
  }, [openSettingsTab]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isDark = theme === 'dark';

  const fetchResources = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (typeof window === 'undefined' || !window.electron?.db?.resources) return;
    try {
      if (!silent) setLoading(true);
      // Scope to the active project in SQL so files never leak across projects
      // and a project never loses its own files to the global LIMIT.
      const result = await window.electron.db.resources.listLight(500, hubProjectId);
      if (result?.success && result.data) setResources(result.data as Resource[]);
    } catch { /* ignore */ }
    finally {
      if (!silent) setLoading(false);
    }
  }, [hubProjectId]);

  const fetchProjects = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.db?.projects) return;
    try {
      const result = await window.electron.db.projects.getAll();
      if (result?.success && result.data) {
        setProjects(result.data as Project[]);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void fetchResources();
    void fetchProjects();
  }, [fetchProjects, fetchResources]);

  const debouncedSilentRefetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleDebouncedSilentRefetch = useCallback(() => {
    if (debouncedSilentRefetchRef.current) clearTimeout(debouncedSilentRefetchRef.current);
    debouncedSilentRefetchRef.current = setTimeout(() => {
      debouncedSilentRefetchRef.current = null;
      void fetchResources({ silent: true });
    }, 400);
  }, [fetchResources]);

  const fetchResourcesRef = useRef(fetchResources);
  fetchResourcesRef.current = fetchResources;
  const fetchProjectsRef = useRef(fetchProjects);
  fetchProjectsRef.current = fetchProjects;
  const scheduleDebouncedSilentRefetchRef = useRef(scheduleDebouncedSilentRefetch);
  scheduleDebouncedSilentRefetchRef.current = scheduleDebouncedSilentRefetch;
  const setResourcesRef = useRef(setResources);
  setResourcesRef.current = setResources;
  const resourcesRef = useRef(resources);
  resourcesRef.current = resources;
  const [autoExpandFolderIds, setAutoExpandFolderIds] = useState<string[]>([]);

  const requestExpandFolderChain = useCallback((folderId: string | null | undefined) => {
    if (!folderId) return;
    const byId = new Map(resourcesRef.current.map((r) => [r.id, r]));
    const chain: string[] = [];
    let current: string | null | undefined = folderId;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      chain.push(current);
      const row = byId.get(current);
      current = row?.folder_id ?? null;
    }
    if (chain.length === 0) return;
    setAutoExpandFolderIds((prev) => [...new Set([...prev, ...chain])]);
  }, []);

  const scopedResources = resources.filter((resource) => resource.project_id === hubProjectId);

  const getDefaultProjectId = useCallback(() => {
    return currentProject?.id ?? 'default';
  }, [currentProject?.id]);

  const handleCreateNote = useCallback(async () => {
    if (!window.electron?.db?.resources) return;
    const now = Date.now();
    const id = `res_${now}_${Math.random().toString(36).substr(2, 9)}`;
    const result = await window.electron.db.resources.create({
      id,
      type: 'note' as Resource['type'],
      title: 'Untitled Note',
      project_id: getDefaultProjectId(),
      content: '',
      created_at: now,
      updated_at: now,
    });
    if (result?.success) {
      await fetchResources({ silent: true });
      useTabStore.getState().openResourceTab(id, 'note', 'Untitled Note', getDefaultProjectId());
    }
  }, [getDefaultProjectId, fetchResources]);

  const handleCreateNotebook = useCallback(async () => {
    if (!window.electron?.db?.resources) return;
    const now = Date.now();
    const id = `res_${now}_${Math.random().toString(36).substr(2, 9)}`;
    const cells = [{ id: crypto.randomUUID(), type: 'code', source: '', outputs: [] }];
    const result = await window.electron.db.resources.create({
      id,
      type: 'notebook' as Resource['type'],
      title: 'Untitled Notebook',
      project_id: getDefaultProjectId(),
      content: JSON.stringify({ cells }),
      created_at: now,
      updated_at: now,
    });
    if (result?.success) {
      await fetchResources({ silent: true });
      useTabStore.getState().openResourceTab(id, 'notebook', 'Untitled Notebook', getDefaultProjectId());
    }
  }, [getDefaultProjectId, fetchResources]);

  const handleCreateArtifact = useCallback(async () => {
    if (!window.electron?.artifacts) return;
    const result = await window.electron.artifacts.create({
      title: t('artifacts.new_artifact'),
      artifactType: 'custom',
      state: {
        html: '<div style="padding:1.5rem;color:var(--muted-foreground)">' +
          '<p>Ask Many to generate content for this artifact.</p>' +
          '</div>',
        data: {},
      },
      projectId: getDefaultProjectId(),
    });
    if (result?.success && result.data) {
      await fetchResources({ silent: true });
      useTabStore.getState().openResourceTab(result.data.resourceId, 'artifact', result.data.title, getDefaultProjectId());
    }
  }, [getDefaultProjectId, fetchResources, t]);

  const handleAddUrl = useCallback(async (url: string) => {
    if (!window.electron?.db?.resources) return;
    const now = Date.now();
    const id = `res_${now}_${Math.random().toString(36).substr(2, 9)}`;
    const title = url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    const result = await window.electron.db.resources.create({
      id,
      type: 'url' as Resource['type'],
      title,
      project_id: getDefaultProjectId(),
      content: url,
      created_at: now,
      updated_at: now,
    });
    if (result?.success) {
      await fetchResources({ silent: true });
      useTabStore.getState().openResourceTab(id, 'url', title ?? url, getDefaultProjectId());
    }
  }, [getDefaultProjectId, fetchResources]);

  const handleNewFolderAtRoot = useCallback(async (name: string) => {
    const now = Date.now();
    const result = await window.electron?.db?.resources?.create({
      id: `res_${now}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'folder' as Resource['type'],
      title: name,
      folder_id: null,
      project_id: getDefaultProjectId(),
      metadata: {},
      created_at: now,
      updated_at: now,
    });
    if (result?.success) void fetchResources({ silent: true });
  }, [getDefaultProjectId, fetchResources]);

  const handleImportFile = useCallback(async () => {
    if (!window.electron?.selectFiles || !window.electron?.resource?.importMultiple) return;
    const filePaths = await window.electron.selectFiles({ properties: ['openFile', 'multiSelections'] });
    if (!filePaths || filePaths.length === 0) return;
    const projectId = getDefaultProjectId();
    const result = await window.electron.resource.importMultiple(filePaths, projectId);
    if (result?.errors?.length) {
      const duplicateCount = result.errors.filter((entry) => entry.error === 'duplicate').length;
      if (duplicateCount > 0) {
        showToast('warning', `${duplicateCount} archivo(s) ya existían en la biblioteca.`);
      }
    }
    void fetchResources({ silent: true });
  }, [getDefaultProjectId, fetchResources]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) return;
    const onCreated = () => { void fetchResourcesRef.current({ silent: true }); };
    const onDeleted = () => { void fetchResourcesRef.current({ silent: true }); };
    const onProjectCreated = () => { void fetchProjectsRef.current(); };
    const u1 = window.electron.on('resource:created', onCreated);
    const onUpdated = (payload: unknown) => {
      const p = payload as {
        id?: string;
        folder_id?: string | null;
        updates?: Record<string, unknown>;
      };
      const folderId =
        p.updates && Object.prototype.hasOwnProperty.call(p.updates, 'folder_id')
          ? (p.updates.folder_id as string | null)
          : p.folder_id;
      if (folderId) {
        requestExpandFolderChain(folderId);
      }
      const updates =
        p.updates ??
        (Object.prototype.hasOwnProperty.call(p, 'folder_id')
          ? { folder_id: p.folder_id, updated_at: Date.now() }
          : null);
      if (p?.id && updates) {
        setResourcesRef.current((prev) =>
          prev.map((r) => {
            if (r.id !== p.id) return r;
            const merged: Resource = { ...r, ...(updates as Partial<Resource>) };
            const rawMeta = updates.metadata;
            if (rawMeta != null) {
              const existingMeta = parseMeta(r);
              const incomingMeta: Record<string, unknown> =
                typeof rawMeta === 'string'
                  ? (() => { try { return JSON.parse(rawMeta) as Record<string, unknown>; } catch { return {}; } })()
                  : typeof rawMeta === 'object' ? (rawMeta as Record<string, unknown>) : {};
              merged.metadata = { ...existingMeta, ...incomingMeta };
            }
            return merged;
          }),
        );
      }
      scheduleDebouncedSilentRefetchRef.current();
    };
    const u2 = window.electron.on('resource:updated', onUpdated);
    const u3 = window.electron.on('resource:deleted', onDeleted);
    const u4 = window.electron.on('project:created', onProjectCreated);
    const onProjectDeleted = (payload: { id?: string }) => {
      void fetchProjectsRef.current();
      const deletedId = payload?.id;
      const cur = useAppStore.getState().currentProject;
      if (deletedId && cur?.id === deletedId) {
        void window.electron.db.projects.getAll().then((all) => {
          if (all?.success && all.data) {
            const list = all.data as Project[];
            const dome = list.find((p) => p.id === 'default');
            useAppStore.getState().setCurrentProject(dome ?? list[0] ?? null);
          }
        });
      }
      void fetchResourcesRef.current({ silent: true });
    };
    const u5 = window.electron.on('project:deleted', onProjectDeleted);
    const onResourcesChanged = () => { void fetchResourcesRef.current({ silent: true }); };
    window.addEventListener('dome:resources-changed', onResourcesChanged);
    return () => {
      u1?.();
      u2?.();
      u3?.();
      u4?.();
      u5?.();
      window.removeEventListener('dome:resources-changed', onResourcesChanged);
    };
  }, [requestExpandFolderChain]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- clear pending debounced refetch on unmount only
  useEffect(() => {
    return () => {
      const pending = debouncedSilentRefetchRef.current;
      if (pending) clearTimeout(pending);
      debouncedSilentRefetchRef.current = null;
    };
  }, []);

  type UnifiedNavItem =
    | { key: string; kind: 'section'; sectionId: string; label: string; icon: IconSvgElement }
    | {
        key: string;
        kind: 'tab';
        tabType: TabType;
        label: string;
        icon: IconSvgElement;
        onOpen: () => void;
        count?: number;
      };

  /** Navegación principal: acceso diario (biblioteca, agenda, núcleo de automatización). */
  const primaryUnifiedNavItems = useMemo((): UnifiedNavItem[] => {
    return [
      {
        key: 'library',
        kind: 'section',
        sectionId: 'library',
        label: t('workspace.home'),
        icon: Home01Icon,
      },
      {
        key: 'projects',
        kind: 'tab',
        tabType: 'projects',
        label: t('tabs.projects'),
        icon: Layers01Icon,
        onOpen: openProjectsTab,
      },
      {
        key: 'calendar',
        kind: 'tab',
        tabType: 'calendar',
        label: t('workspace.calendar'),
        icon: Calendar03Icon,
        onOpen: openCalendarTab,
      },
      {
        key: 'github',
        kind: 'tab',
        tabType: 'github',
        label: t('github.tab_title'),
        icon: Task01Icon,
        onOpen: openGitHubTab,
      },
      {
        key: 'email',
        kind: 'tab',
        tabType: 'email',
        label: t('email.tab_title'),
        icon: Mail01Icon,
        onOpen: openEmailTab,
      },
      {
        key: 'social',
        kind: 'tab',
        tabType: 'social',
        label: t('social.tab_title'),
        icon: Share08Icon,
        onOpen: openSocialTab,
      },
      {
        key: 'pipelines',
        kind: 'tab',
        tabType: 'pipelines',
        label: t('tabs.pipelines'),
        icon: WorkflowSquare01Icon,
        onOpen: openPipelinesTab,
      },
      {
        key: 'agents',
        kind: 'tab',
        tabType: 'agents',
        label: t('tabs.agents'),
        icon: BotIcon,
        onOpen: openAgentsTab,
      },
      {
        key: 'workflows',
        kind: 'tab',
        tabType: 'workflows',
        label: t('tabs.workflows'),
        icon: GitBranchIcon,
        onOpen: openWorkflowsTab,
      },
      {
        key: 'automations',
        kind: 'tab',
        tabType: 'automations',
        label: t('tabs.automations'),
        icon: ZapIcon,
        onOpen: openAutomationsTab,
      },
      {
        key: 'runs',
        kind: 'tab',
        tabType: 'runs',
        label: t('tabs.runs'),
        icon: Activity01Icon,
        onOpen: openRunsTab,
      },
    ];
  }, [
    t,
    openCalendarTab,
    openGitHubTab,
    openEmailTab,
    openSocialTab,
    openProjectsTab,
    openPipelinesTab,
    openAgentsTab,
    openWorkflowsTab,
    openAutomationsTab,
    openRunsTab,
  ]);

  /** Menos uso típico: estudio, taxonomía, extensiones — encima de Ajustes. */
  const secondaryUnifiedNavItems = useMemo((): UnifiedNavItem[] => {
    return [
      {
        key: 'learn',
        kind: 'tab',
        tabType: 'learn',
        label: t('workspace.learn'),
        icon: BookOpen01Icon,
        onOpen: openLearnTab,
      },
      {
        key: 'marketplace',
        kind: 'tab',
        tabType: 'marketplace',
        label: t('workspace.marketplace'),
        icon: Store01Icon,
        onOpen: openMarketplaceTab,
      },
    ];
  }, [t, openLearnTab, openMarketplaceTab]);

  const visiblePrimaryUnifiedNavItems = useMemo(() => {
    const visible: UnifiedNavItem[] = [];
    for (const item of primaryUnifiedNavItems) {
      if (navItemVisible(item.key)) visible.push(item);
    }
    return visible;
  }, [primaryUnifiedNavItems, navItemVisible]);

  const visibleSecondaryUnifiedNavItems = useMemo(() => {
    const visible: UnifiedNavItem[] = [];
    for (const item of secondaryUnifiedNavItems) {
      if (navItemVisible(item.key)) visible.push(item);
    }
    return visible;
  }, [secondaryUnifiedNavItems, navItemVisible]);

  const handleOpenProjectRootFolder = useCallback(() => {
    openFolderTab(hubProjectId, activeProjectLabel, undefined, hubProjectId);
    setWorkspaceOpen(true);
  }, [openFolderTab, hubProjectId, activeProjectLabel]);

  const handleUnifiedNavClick = (item: UnifiedNavItem) => {
    if (item.kind === 'section') {
      setSection(item.sectionId as typeof activeSection);
      const { activateTab, tabs: currentTabs } = useTabStore.getState();
      const homeTab = currentTabs.find((tab) => tab.id === 'home');
      if (homeTab && activeTabId !== 'home') activateTab('home');
      return;
    }
    item.onOpen();
  };

  const getUnifiedNavActive = (item: UnifiedNavItem) => {
    if (item.kind === 'section') {
      return activeTab?.type === 'home' && activeSection === item.sectionId;
    }
    return activeTab?.type === item.tabType;
  };

  return (
    <aside
      className={cn(
        'dome-left-sidebar flex h-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-[width,opacity] duration-200 ease-out',
        collapsed ? 'w-0 opacity-0' : 'w-62 opacity-100',
      )}
      aria-hidden={collapsed}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1">
          {/* Navegación principal */}
          <nav className="flex flex-col gap-0.5 px-2 pt-2.5 pb-1.5" aria-label={t('sidebar.navigation', 'Navegación')}>
            {visiblePrimaryUnifiedNavItems.map((item) => (
              <SidebarNavButton
                key={item.key}
                icon={item.icon}
                label={item.label}
                active={getUnifiedNavActive(item)}
                count={item.kind === 'tab' ? item.count : undefined}
                dataTour={item.key}
                onClick={() => handleUnifiedNavClick(item)}
              />
            ))}
          </nav>

          <Separator className="mx-3 bg-sidebar-border" />

          {/* Workspace tree */}
          <div className="py-1.5">
            <div className="flex items-center gap-1 px-2 py-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setWorkspaceOpen(!workspaceOpen)}
                aria-expanded={workspaceOpen}
                aria-label={workspaceOpen ? t('sidebar.collapse_workspace', 'Contraer workspace') : t('sidebar.expand_workspace', 'Expandir workspace')}
              >
                <HugeiconsIcon icon={ChevronDownIcon} className={`shrink-0 transition-transform ${workspaceOpen ? '' : '-rotate-90'}`} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleOpenProjectRootFolder}
                className="min-w-0 flex-1 justify-start text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wide"
              >
                <span className="truncate">{activeProjectLabel}</span>
              </Button>

              <ShellProjectPicker />

              {/* New resource button */}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('sidebar.new_resource', 'Nuevo recurso')}
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  setAddMenu({ x: rect.left, y: rect.bottom + 4 });
                }}
              >
                <HugeiconsIcon icon={PlusSignIcon} />
              </Button>

              {/* New folder button */}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('sidebar.new_folder', 'Nueva carpeta')}
                onClick={() => setNewFolderInWorkspace(true)}
              >
                <HugeiconsIcon icon={FolderAddIcon} />
              </Button>

              {/* Open workspace folder in Finder/Explorer */}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('workspace.open_vault_folder')}
                onClick={() => { void window.electron?.resource?.openVaultRoot(hubProjectId); }}
              >
                <HugeiconsIcon icon={FolderSymlinkIcon} />
              </Button>
            </div>
            {workspaceOpen && (
              <div className="pb-2">
                {loading ? (
                  <div className="flex items-center justify-center py-6">
                    <HugeiconsIcon icon={RefreshIcon} className="animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <FileTree
                    resources={scopedResources}
                    onRefresh={() => { void fetchResources({ silent: true }); }}
                    autoExpandFolderIds={autoExpandFolderIds}
                  />
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Add resource dropdown */}
        {addMenu && (
          <AddResourceMenu
            x={addMenu.x}
            y={addMenu.y}
            onClose={() => setAddMenu(null)}
            onCreateNote={handleCreateNote}
            onCreateNotebook={handleCreateNotebook}
            onCreateArtifact={() => { setAddMenu(null); handleCreateArtifact(); }}
            onAddUrl={() => setShowUrlInput(true)}
            onImportFile={handleImportFile}
            onImportFromCloud={() => { setAddMenu(null); setShowCloudPicker(true); }}
          />
        )}

        {/* Cloud file picker modal */}
        {showCloudPicker && (
          <Suspense fallback={null}>
            <CloudFilePicker
              onClose={() => { setShowCloudPicker(false); void fetchResources({ silent: true }); }}
              projectId={getDefaultProjectId()}
            />
          </Suspense>
        )}

        {/* URL input modal */}
        {showUrlInput && (
          <UrlInputModal
            onConfirm={handleAddUrl}
            onClose={() => setShowUrlInput(false)}
          />
        )}

        {/* New folder at root */}
        {newFolderInWorkspace && (
          <NewFolderModal
            parentId={null}
            onConfirm={(name) => handleNewFolderAtRoot(name)}
            onClose={() => setNewFolderInWorkspace(false)}
          />
        )}

        {/* Footer: enlaces secundarios, luego Ajustes */}
        <div className="shrink-0 border-t border-sidebar-border p-2">
          <nav className="flex flex-col gap-0.5" aria-label={t('sidebar.more_tools')}>
            {visibleSecondaryUnifiedNavItems.map((item) => (
              <SidebarNavButton
                key={item.key}
                icon={item.icon}
                label={item.label}
                active={getUnifiedNavActive(item)}
                count={item.kind === 'tab' ? item.count : undefined}
                dataTour={item.key}
                onClick={() => handleUnifiedNavClick(item)}
              />
            ))}
            {showSignInCta ? (
              <SidebarNavButton
                icon={Login01Icon}
                label={connectingAccount ? t('sidebar.sign_in_connecting') : t('sidebar.sign_in')}
                onClick={() => void handleSignIn()}
              />
            ) : null}
            {hiddenFeatureCount > 0 ? (
              <SidebarNavButton
                icon={Layers01Icon}
                label={t('features.hidden_notice', { n: hiddenFeatureCount })}
                count={hiddenFeatureCount}
                onClick={goToFeatureSettings}
              />
            ) : null}
            <SidebarNavButton
              icon={Settings01Icon}
              label={t('tabs.settings')}
              active={activeTab?.type === 'settings'}
              count={updateAvailable ? 1 : undefined}
              dataTour="settings"
              onClick={() => {
                openSettingsTab();
                if (updateAvailable) {
                  setTimeout(() => window.dispatchEvent(new CustomEvent('dome:goto-settings-section', { detail: 'advanced' })), 50);
                }
              }}
            />
            <SidebarNavButton
              icon={isDark ? Sun03Icon : MoonIcon}
              label={isDark ? t('settings.appearance.light') : t('settings.appearance.dark')}
              onClick={() => updateTheme(isDark ? 'light' : 'dark')}
            />
          </nav>
        </div>
      </div>
    </aside>
  );
}
