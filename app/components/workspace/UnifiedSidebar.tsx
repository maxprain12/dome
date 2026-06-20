import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense, type ReactNode } from 'react';
const CloudFilePicker = lazy(() => import('@/components/cloud/CloudFilePicker'));
import { Settings, Moon, Sun, Home, Calendar, BookOpen, Tag, Store, RefreshCw, FolderPlus, Plus, Bot, Workflow, Zap, Activity, Layers, ListTodo, Mail, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore, type TabType } from '@/lib/store/useTabStore';
import type { Resource } from '@/lib/hooks/useResources';
import type { Project } from '@/types';
import { showToast } from '@/lib/store/useToastStore';
import { getManyAgents } from '@/lib/agents/api';
import { getWorkflows } from '@/lib/agent-canvas/api';
import {
  listAutomations,
  listRuns,
  onRunUpdated,
  AUTOMATIONS_CHANGED_EVENT,
} from '@/lib/automations/api';
import {
  HUB_AGENTS_CHANGED,
  HUB_AUTOMATIONS_CHANGED,
  HUB_RUNS_CHANGED,
  HUB_WORKFLOWS_CHANGED,
} from '@/lib/hub/hubEvents';
import { useFeaturesStore, useHiddenFeatureCount } from '@/lib/store/useFeaturesStore';
import { isFeatureVisible } from '@/lib/features/featureKeys';

// ---------------------------------------------------------------------------
// Folder colors — central palette in app/lib/ui/palettes.ts (persisted in DB)
// ---------------------------------------------------------------------------

// Subcomponentes extraídos (03/T02) — misma UI, archivos en ./sidebar/.
import { pickFolderColor, parseMeta } from './sidebar/sidebarHelpers';
import FileTree from './sidebar/SidebarFileTree';
import { NewFolderModal, UrlInputModal } from './sidebar/SidebarModals';
import AddResourceMenu from './sidebar/AddResourceMenu';
import ShellProjectPicker from '@/components/shell/ShellProjectPicker';

interface UnifiedSidebarProps {
  collapsed: boolean;
  onCollapse: () => void;
}

export default function UnifiedSidebar({ collapsed, onCollapse: _onCollapse }: UnifiedSidebarProps) {
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
  const [hubCounts, setHubCounts] = useState({
    agents: 0,
    workflows: 0,
    automations: 0,
    runs: 0,
  });

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
    openProjectsTab,
    openLearnTab,
    openTagsTab,
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
      openProjectsTab: s.openProjectsTab,
      openLearnTab: s.openLearnTab,
      openTagsTab: s.openTagsTab,
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

  const refreshHubCounts = useCallback(async () => {
    try {
      const pid = useAppStore.getState().currentProject?.id ?? 'default';
      const [agentList, wfList, autoList, runList] = await Promise.all([
        getManyAgents(pid),
        getWorkflows(pid),
        listAutomations({ projectId: pid }),
        listRuns({ limit: 200, projectId: pid }),
      ]);
      setHubCounts({
        agents: agentList.length,
        workflows: wfList.length,
        automations: autoList.length,
        runs: runList.filter((r) => r.ownerType !== 'many').length,
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshHubCounts();
    const onAgents = () => void refreshHubCounts();
    const onWorkflows = () => void refreshHubCounts();
    const onAutos = () => void refreshHubCounts();
    const onRuns = () => void refreshHubCounts();
    window.addEventListener(HUB_AGENTS_CHANGED, onAgents);
    window.addEventListener(HUB_WORKFLOWS_CHANGED, onWorkflows);
    window.addEventListener(HUB_AUTOMATIONS_CHANGED, onAutos);
    window.addEventListener(HUB_RUNS_CHANGED, onRuns);
    window.addEventListener(AUTOMATIONS_CHANGED_EVENT, onAutos);
    const unsubRuns = onRunUpdated(() => void refreshHubCounts());
    return () => {
      window.removeEventListener(HUB_AGENTS_CHANGED, onAgents);
      window.removeEventListener(HUB_WORKFLOWS_CHANGED, onWorkflows);
      window.removeEventListener(HUB_AUTOMATIONS_CHANGED, onAutos);
      window.removeEventListener(HUB_RUNS_CHANGED, onRuns);
      window.removeEventListener(AUTOMATIONS_CHANGED_EVENT, onAutos);
      unsubRuns();
    };
  }, [refreshHubCounts]);

  useEffect(() => {
    void refreshHubCounts();
  }, [hubProjectId, refreshHubCounts]);

  const fetchResources = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (typeof window === 'undefined' || !window.electron?.db?.resources) return;
    try {
      if (!silent) setLoading(true);
      const result = await window.electron.db.resources.getAll(500);
      if (result?.success && result.data) setResources(result.data as Resource[]);
    } catch { /* ignore */ }
    finally {
      if (!silent) setLoading(false);
    }
  }, []);

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
      useTabStore.getState().openResourceTab(id, 'note', 'Untitled Note');
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
      useTabStore.getState().openResourceTab(id, 'notebook', 'Untitled Notebook');
    }
  }, [getDefaultProjectId, fetchResources]);

  const handleCreateArtifact = useCallback(async () => {
    if (!window.electron?.artifacts) return;
    const result = await window.electron.artifacts.create({
      title: t('artifacts.new_artifact'),
      artifactType: 'custom',
      state: {
        html: '<div style="padding:1.5rem;color:var(--secondary-text)">' +
          '<p>Ask Many to generate content for this artifact.</p>' +
          '</div>',
        data: {},
      },
      projectId: getDefaultProjectId(),
    });
    if (result?.success && result.data) {
      await fetchResources({ silent: true });
      useTabStore.getState().openResourceTab(result.data.resourceId, 'artifact', result.data.title);
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
      useTabStore.getState().openResourceTab(id, 'url', title ?? url);
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
      metadata: { color: pickFolderColor() },
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
    const onCreated = () => { void fetchResources({ silent: true }); };
    const onDeleted = () => { void fetchResources({ silent: true }); };
    const onProjectCreated = () => { void fetchProjects(); };
    const u1 = window.electron.on('resource:created', onCreated);
    const onUpdated = (payload: unknown) => {
      // Immediately apply metadata / title changes so folder colors refresh without waiting for the debounced refetch
      const p = payload as { id?: string; updates?: Record<string, unknown> };
      if (p?.id && p?.updates) {
        setResources((prev) =>
          prev.map((r) => {
            if (r.id !== p.id) return r;
            const updates = p.updates!;
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
          })
        );
      }
      scheduleDebouncedSilentRefetch();
    };
    const u2 = window.electron.on('resource:updated', onUpdated);
    const u3 = window.electron.on('resource:deleted', onDeleted);
    const u4 = window.electron.on('project:created', onProjectCreated);
    const onProjectDeleted = (payload: { id?: string }) => {
      void fetchProjects();
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
      void fetchResources({ silent: true });
      void refreshHubCounts();
    };
    const u5 = window.electron.on('project:deleted', onProjectDeleted);
    return () => {
      u1?.();
      u2?.();
      u3?.();
      u4?.();
      u5?.();
      if (debouncedSilentRefetchRef.current) clearTimeout(debouncedSilentRefetchRef.current);
    };
  }, [fetchProjects, fetchResources, scheduleDebouncedSilentRefetch, refreshHubCounts]);

  type UnifiedNavItem =
    | { key: string; kind: 'section'; sectionId: string; label: string; icon: ReactNode }
    | {
        key: string;
        kind: 'tab';
        tabType: TabType;
        label: string;
        icon: ReactNode;
        onOpen: () => void;
        count?: number;
      };

  /** Navegación principal: acceso diario (biblioteca, agenda, núcleo de automatización). */
  const primaryUnifiedNavItems = useMemo((): UnifiedNavItem[] => {
    const sw = 1.75;
    return [
      {
        key: 'library',
        kind: 'section',
        sectionId: 'library',
        label: t('workspace.home'),
        icon: <Home className="size-4 shrink-0" strokeWidth={sw} />,
      },
      {
        key: 'projects',
        kind: 'tab',
        tabType: 'projects',
        label: t('tabs.projects'),
        icon: <Layers className="size-4 shrink-0" strokeWidth={sw} />,
        onOpen: openProjectsTab,
      },
      {
        key: 'calendar',
        kind: 'tab',
        tabType: 'calendar',
        label: t('workspace.calendar'),
        icon: <Calendar className="size-4 shrink-0" strokeWidth={sw} />,
        onOpen: openCalendarTab,
      },
      {
        key: 'github',
        kind: 'tab',
        tabType: 'github',
        label: t('github.tab_title'),
        icon: <ListTodo className="size-4 shrink-0" strokeWidth={sw} />,
        onOpen: openGitHubTab,
      },
      {
        key: 'email',
        kind: 'tab',
        tabType: 'email',
        label: t('email.tab_title'),
        icon: <Mail className="size-4 shrink-0" strokeWidth={sw} />,
        onOpen: openEmailTab,
      },
      {
        key: 'agents',
        kind: 'tab',
        tabType: 'agents',
        label: t('automationHub.tab_agents'),
        icon: <Bot className="size-4 shrink-0" strokeWidth={sw} />,
        count: hubCounts.agents,
        onOpen: openAgentsTab,
      },
      {
        key: 'workflows',
        kind: 'tab',
        tabType: 'workflows',
        label: t('automationHub.tab_workflows'),
        icon: <Workflow className="size-4 shrink-0" strokeWidth={sw} />,
        count: hubCounts.workflows,
        onOpen: openWorkflowsTab,
      },
      {
        key: 'automations',
        kind: 'tab',
        tabType: 'automations',
        label: t('automationHub.tab_automations'),
        icon: <Zap className="size-4 shrink-0" strokeWidth={sw} />,
        count: hubCounts.automations,
        onOpen: openAutomationsTab,
      },
      {
        key: 'runs',
        kind: 'tab',
        tabType: 'runs',
        label: t('automationHub.tab_runs'),
        icon: <Activity className="size-4 shrink-0" strokeWidth={sw} />,
        count: hubCounts.runs,
        onOpen: openRunsTab,
      },
    ];
  }, [
    t,
    hubCounts.agents,
    hubCounts.workflows,
    hubCounts.automations,
    hubCounts.runs,
    openCalendarTab,
    openGitHubTab,
    openEmailTab,
    openProjectsTab,
    openAgentsTab,
    openWorkflowsTab,
    openAutomationsTab,
    openRunsTab,
  ]);

  /** Menos uso típico: estudio, taxonomía, extensiones — encima de Ajustes. */
  const secondaryUnifiedNavItems = useMemo((): UnifiedNavItem[] => {
    const sw = 1.75;
    return [
      {
        key: 'learn',
        kind: 'tab',
        tabType: 'learn',
        label: t('workspace.learn'),
        icon: <BookOpen className="size-4 shrink-0" strokeWidth={sw} />,
        onOpen: openLearnTab,
      },
      {
        key: 'tags',
        kind: 'tab',
        tabType: 'tags',
        label: t('workspace.tags'),
        icon: <Tag className="size-4 shrink-0" strokeWidth={sw} />,
        onOpen: openTagsTab,
      },
      {
        key: 'marketplace',
        kind: 'tab',
        tabType: 'marketplace',
        label: t('workspace.marketplace'),
        icon: <Store className="size-4 shrink-0" strokeWidth={sw} />,
        onOpen: openMarketplaceTab,
      },
    ];
  }, [t, openLearnTab, openTagsTab, openMarketplaceTab]);

  const handleOpenProjectRootFolder = useCallback(() => {
    openFolderTab(hubProjectId, activeProjectLabel);
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

  if (collapsed) {
    return null;
  }

  return (
    <aside
      className="dome-left-sidebar flex flex-col h-full relative shrink-0 overflow-hidden"
      style={{ width: 260, minWidth: 260, background: 'var(--dome-sidebar-bg)', borderRight: '1px solid var(--dome-border)' }}
    >
      <div className="dome-sidebar-project-picker shrink-0 px-2 pt-2 pb-2 border-b" style={{ borderColor: 'var(--dome-border)' }}>
        <ShellProjectPicker />
      </div>

      {/* Navegación principal */}
      <div className="shrink-0 px-2 pt-2 pb-2 border-b" style={{ borderColor: 'var(--dome-border)' }}>
        <div className="flex flex-col gap-0.5">
          {primaryUnifiedNavItems.filter((item) => navItemVisible(item.key)).map((item) => {
            const isActive = getUnifiedNavActive(item);
            const count = item.kind === 'tab' ? item.count : undefined;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleUnifiedNavClick(item)}
                className="flex items-center w-full text-left transition-colors duration-150 rounded-md"
                style={{
                  gap: 8,
                  paddingLeft: 8,
                  paddingRight: 8,
                  minHeight: 30,
                  fontSize: 12.5,
                  fontWeight: 500,
                  background: isActive ? 'var(--dome-surface)' : 'transparent',
                  color: isActive ? 'var(--dome-text)' : 'var(--dome-text-secondary)',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <span className="shrink-0" style={{ color: isActive ? 'var(--dome-text)' : 'var(--dome-text-muted)' }}>
                  {item.icon}
                </span>
                <span className="truncate flex-1 min-w-0 text-left">{item.label}</span>
                {count !== undefined ? (
                  <span
                    className="shrink-0 tabular-nums"
                    style={{ fontSize: 12, fontWeight: 500, color: 'var(--dome-text-muted)' }}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Workspace tree */}
      <div className="flex-1 overflow-y-auto">
        <div className="border-b" style={{ borderColor: 'var(--dome-border)' }}>
          {/* Header row */}
          <div className="flex items-center px-2 py-1.5 gap-0.5">
            <button
              type="button"
              onClick={() => setWorkspaceOpen(!workspaceOpen)}
              className="flex items-center justify-center shrink-0 rounded-md transition-colors"
              style={{ width: 22, height: 22, color: 'var(--dome-text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              aria-expanded={workspaceOpen}
              aria-label={workspaceOpen ? t('sidebar.collapse_workspace', 'Contraer workspace') : t('sidebar.expand_workspace', 'Expandir workspace')}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <ChevronDown className={`size-3 shrink-0 transition-transform ${workspaceOpen ? '' : '-rotate-90'}`} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={handleOpenProjectRootFolder}
              className="flex items-center flex-1 min-w-0 text-left rounded-md px-1 py-0.5 transition-colors"
              style={{ color: 'var(--dome-text)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <span>Workspace</span>
            </button>

            {/* New resource button */}
            <button
              type="button"
              title="Nuevo recurso"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                setAddMenu({ x: rect.left, y: rect.bottom + 4 });
              }}
              className="flex items-center justify-center rounded transition-colors shrink-0"
              style={{ width: 22, height: 22, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)'; }}
            >
              <Plus className="size-3.5" strokeWidth={2.5} />
            </button>

            {/* New folder button */}
            <button
              type="button"
              title="Nueva carpeta"
              onClick={() => setNewFolderInWorkspace(true)}
              className="flex items-center justify-center rounded transition-colors shrink-0"
              style={{ width: 22, height: 22, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dome-text-muted)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)'; }}
            >
              <FolderPlus className="size-3.5" strokeWidth={2} />
            </button>
          </div>
          {workspaceOpen && (
            <div className="pb-2">
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <RefreshCw className="size-4 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
                </div>
              ) : (
                <FileTree
                  resources={scopedResources}
                  onRefresh={() => { void fetchResources({ silent: true }); }}
                />
              )}
            </div>
          )}
        </div>
      </div>

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
      <div className="shrink-0 border-t" style={{ borderColor: 'var(--dome-border)' }}>
        <div className="px-2 pt-2 pb-1.5">
          <p
            className="px-2 pb-1 uppercase tracking-wide"
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: 'var(--dome-text-muted)',
            }}
          >
            {t('sidebar.more_tools')}
          </p>
          <div className="flex flex-col gap-0.5">
            {secondaryUnifiedNavItems.filter((item) => navItemVisible(item.key)).map((item) => {
              const isActive = getUnifiedNavActive(item);
              const count = item.kind === 'tab' ? item.count : undefined;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleUnifiedNavClick(item)}
                  className="flex items-center w-full text-left transition-colors duration-150 rounded-md"
                  style={{
                    gap: 8,
                    paddingLeft: 8,
                    paddingRight: 8,
                    minHeight: 30,
                    fontSize: 12.5,
                    fontWeight: 500,
                    background: isActive ? 'var(--dome-surface)' : 'transparent',
                    color: isActive ? 'var(--dome-text)' : 'var(--dome-text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  <span className="shrink-0" style={{ color: isActive ? 'var(--dome-text)' : 'var(--dome-text-muted)' }}>
                    {item.icon}
                  </span>
                  <span className="truncate flex-1 min-w-0 text-left">{item.label}</span>
                  {count !== undefined ? (
                    <span
                      className="shrink-0 tabular-nums"
                      style={{ fontSize: 12, fontWeight: 500, color: 'var(--dome-text-muted)' }}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        {hiddenFeatureCount > 0 && (
          <div className="px-2 pt-2">
            <button
              type="button"
              onClick={goToFeatureSettings}
              className="flex items-center gap-2 w-full text-left rounded-md px-2 py-1.5 transition-colors"
              style={{
                fontSize: 11.5,
                color: 'var(--dome-text-muted)',
                background: 'var(--dome-bg-hover)',
                border: '1px solid var(--dome-border)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--dome-accent)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--dome-border)'; }}
              title={t('features.hidden_notice_title')}
            >
              <span className="truncate">{t('features.hidden_notice', { n: hiddenFeatureCount })}</span>
            </button>
          </div>
        )}
        <div className="p-2 border-t" style={{ borderColor: 'var(--dome-border)' }}>
        <button
          type="button"
          onClick={() => {
            openSettingsTab();
            if (updateAvailable) {
              // Give the tab a frame to mount before signalling the section
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('dome:goto-settings-section', { detail: 'advanced' }));
              }, 50);
            }
          }}
          className="flex items-center gap-2 w-full text-left transition-colors rounded-md px-2 py-1.5"
          style={{ fontSize: 12, color: 'var(--dome-text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          <div className="relative shrink-0">
            <Settings className="size-4" strokeWidth={1.75} />
            {updateAvailable && (
              <span
                className="absolute -top-0.5 -right-0.5 rounded-full"
                style={{ width: 6, height: 6, background: 'var(--accent)', display: 'block' }}
              />
            )}
          </div>
          <span>Settings</span>
        </button>
        </div>
        <div className="flex items-center justify-between p-2 border-t" style={{ borderColor: 'var(--dome-border)' }}>
          <span style={{ fontSize: 12, color: 'var(--dome-text-muted)', opacity: 0.6 }}>Made with ❤️ by <a href="https://www.linkedin.com/in/advo2/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Alder</a> and <a href="https://www.linkedin.com/in/maria-sugasaga/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Mery</a></span>
          <button
            type="button"
            onClick={() => updateTheme(isDark ? 'light' : 'dark')}
            className="flex items-center justify-center rounded transition-colors"
            style={{ width: 24, height: 24, background: 'transparent', color: 'var(--dome-text-muted)', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            {isDark ? <Sun className="size-3.5" strokeWidth={1.75} /> : <Moon className="size-3.5" strokeWidth={1.75} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
