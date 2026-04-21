import { create } from 'zustand';
import type {
  Project,
  Resource,
  Source,
  Tag,
  AppPreferences,
  CitationStyle,
  StudioOutput,
  HomeDashboardPreferences,
} from '@/types';
import { DEFAULT_HOME_DASHBOARD_PREFERENCES } from '@/types';
import { getAppPreferences, saveAppPreferences, setTheme as saveTheme, setCitationStyle } from '../settings';
import { normalizeHomeDashboardPreferences } from '../settings/home-dashboard';
import { capturePostHog } from '../analytics/posthog';
import { ANALYTICS_EVENTS } from '../analytics/events';

interface AppState {
  // Proyectos
  projects: Project[];
  currentProject: Project | null;
  setProjects: (projects: Project[]) => void;
  loadCurrentProject: () => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  // Recursos
  resources: Resource[];
  currentResource: Resource | null;
  setResources: (resources: Resource[]) => void;
  setCurrentResource: (resource: Resource | null) => void;
  addResource: (resource: Resource) => void;
  updateResource: (id: string, updates: Partial<Resource>) => void;
  deleteResource: (id: string) => void;

  // Fuentes
  sources: Source[];
  setSources: (sources: Source[]) => void;
  addSource: (source: Source) => void;
  updateSource: (id: string, updates: Partial<Source>) => void;
  deleteSource: (id: string) => void;

  // Etiquetas
  tags: Tag[];
  setTags: (tags: Tag[]) => void;
  addTag: (tag: Tag) => void;
  deleteTag: (id: string) => void;

  // UI Estado
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  homeSidebarSection:
    | 'library'
    | 'flashcards'
    | 'chat'
    | 'recent'
    | 'tags'
    | 'studio'
    | 'agents'
    | 'marketplace'
    | 'agent-teams'
    | 'automations-hub'
    | `agent:${string}`
    | `team:${string}`
    | `workflow:${string}`;
  setHomeSidebarSection: (
    section:
      | 'library'
      | 'flashcards'
      | 'chat'
      | 'recent'
      | 'tags'
      | 'studio'
      | 'agents'
      | 'marketplace'
      | 'agent-teams'
      | 'automations-hub'
      | `agent:${string}`
      | `team:${string}`
      | `workflow:${string}`,
  ) => void;
  homeSidebarCollapsed: boolean;
  toggleHomeSidebar: () => void;
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;

  // Home folder context (for AI scope when user is viewing a folder)
  currentFolderId: string | null;
  setCurrentFolderId: (folderId: string | null) => void;

  // Workspace Panel State
  sourcesPanelOpen: boolean;
  studioPanelOpen: boolean;
  selectedSourceIds: string[];
  toggleSourcesPanel: () => void;
  setSourcesPanelOpen: (open: boolean) => void;
  toggleStudioPanel: () => void;
  setSelectedSourceIds: (ids: string[]) => void;
  toggleSourceId: (id: string) => void;
  selectAllSources: (ids: string[]) => void;
  deselectAllSources: () => void;

  // Studio Output State
  activeStudioOutput: StudioOutput | null;
  setActiveStudioOutput: (output: StudioOutput | null) => void;
  studioOutputs: StudioOutput[];
  setStudioOutputs: (outputs: StudioOutput[]) => void;
  addStudioOutput: (output: StudioOutput) => void;
  removeStudioOutput: (id: string) => void;

  // App Preferences
  theme: 'light' | 'dark' | 'auto';
  citationStyle: CitationStyle;
  autoSave: boolean;
  autoBackup: boolean;
  shortcuts?: Record<string, string>;
  homeDashboard: HomeDashboardPreferences;

  // Preference Actions
  loadPreferences: () => Promise<void>;
  updateTheme: (theme: 'light' | 'dark' | 'auto') => Promise<void>;
  updateCitationStyle: (style: CitationStyle) => Promise<void>;
  updatePreferences: (preferences: Partial<AppPreferences>) => Promise<void>;
  updateHomeDashboard: (next: HomeDashboardPreferences) => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  // Proyectos
  projects: [],
  currentProject: null,
  setProjects: (projects) => set({ projects }),
  loadCurrentProject: async () => {
    if (typeof window === 'undefined' || !window.electron?.db?.settings || !window.electron?.db?.projects) {
      return;
    }
    try {
      const settingResult = await window.electron.db.settings.get('last_project_id');
      let projectId =
        settingResult?.success && settingResult.data && String(settingResult.data).trim()
          ? String(settingResult.data).trim()
          : 'default';
      let projectResult = await window.electron.db.projects.getById(projectId);
      if (!projectResult?.success || !projectResult.data) {
        projectId = 'default';
        projectResult = await window.electron.db.projects.getById('default');
        await window.electron.db.settings.set('last_project_id', 'default');
      }
      if (projectResult?.success && projectResult.data) {
        set({ currentProject: projectResult.data });
      } else {
        set({ currentProject: null });
      }
    } catch {
      set({ currentProject: null });
    }
  },
  setCurrentProject: (project) => {
    set({ currentProject: project });
    if (typeof window !== 'undefined' && window.electron?.db?.settings) {
      const value = project?.id ?? 'default';
      void window.electron.db.settings.set('last_project_id', value);
    }
    if (project?.id) {
      capturePostHog(ANALYTICS_EVENTS.PROJECT_SWITCHED, { project_id: project.id });
    }
  },
  addProject: (project) => set((state) => ({ projects: [...state.projects, project] })),
  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),
  deleteProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    })),

  // Recursos
  resources: [],
  currentResource: null,
  setResources: (resources) => set({ resources }),
  setCurrentResource: (resource) => set({ currentResource: resource }),
  addResource: (resource) => set((state) => ({ resources: [...state.resources, resource] })),
  updateResource: (id, updates) =>
    set((state) => ({
      resources: state.resources.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    })),
  deleteResource: (id) =>
    set((state) => ({
      resources: state.resources.filter((r) => r.id !== id),
    })),

  // Fuentes
  sources: [],
  setSources: (sources) => set({ sources }),
  addSource: (source) => set((state) => ({ sources: [...state.sources, source] })),
  updateSource: (id, updates) =>
    set((state) => ({
      sources: state.sources.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),
  deleteSource: (id) =>
    set((state) => ({
      sources: state.sources.filter((s) => s.id !== id),
    })),

  // Etiquetas
  tags: [],
  setTags: (tags) => set({ tags }),
  addTag: (tag) => set((state) => ({ tags: [...state.tags, tag] })),
  deleteTag: (id) =>
    set((state) => ({
      tags: state.tags.filter((t) => t.id !== id),
    })),

  // UI Estado
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  homeSidebarSection: 'library',
  setHomeSidebarSection: (section) => set({ homeSidebarSection: section }),
  homeSidebarCollapsed: false,
  toggleHomeSidebar: () => set((state) => ({ homeSidebarCollapsed: !state.homeSidebarCollapsed })),
  viewMode: 'grid',
  setViewMode: (mode) => set({ viewMode: mode }),

  currentFolderId: null,
  setCurrentFolderId: (folderId) => set({ currentFolderId: folderId }),

  // Workspace Panel State
  sourcesPanelOpen: false,
  studioPanelOpen: false,
  selectedSourceIds: [],
  toggleSourcesPanel: () => set((state) => ({ sourcesPanelOpen: !state.sourcesPanelOpen })),
  setSourcesPanelOpen: (open) => set({ sourcesPanelOpen: open }),
  toggleStudioPanel: () => set((state) => ({
    studioPanelOpen: !state.studioPanelOpen,
  })),
  setSelectedSourceIds: (ids) => set({ selectedSourceIds: ids }),
  toggleSourceId: (id) => set((state) => ({
    selectedSourceIds: state.selectedSourceIds.includes(id)
      ? state.selectedSourceIds.filter((sid) => sid !== id)
      : [...state.selectedSourceIds, id]
  })),
  selectAllSources: (ids) => set({ selectedSourceIds: ids }),
  deselectAllSources: () => set({ selectedSourceIds: [] }),

  // Studio Output State
  activeStudioOutput: null,
  setActiveStudioOutput: (output) => set({ activeStudioOutput: output }),
  studioOutputs: [],
  setStudioOutputs: (outputs) => set({ studioOutputs: outputs }),
  addStudioOutput: (output) => set((state) => ({
    studioOutputs: [output, ...state.studioOutputs],
  })),
  removeStudioOutput: (id) => set((state) => ({
    studioOutputs: state.studioOutputs.filter((o) => o.id !== id),
    activeStudioOutput: state.activeStudioOutput?.id === id ? null : state.activeStudioOutput,
  })),

  // App Preferences
  theme: 'light',
  citationStyle: 'apa',
  autoSave: true,
  autoBackup: true,
  shortcuts: undefined,
  homeDashboard: DEFAULT_HOME_DASHBOARD_PREFERENCES,

  // Preference Actions
  loadPreferences: async () => {
    const prefs = await getAppPreferences();
    set({
      theme: prefs.theme,
      citationStyle: prefs.citationStyle,
      autoSave: prefs.autoSave,
      autoBackup: prefs.autoBackup,
      shortcuts: prefs.shortcuts,
      homeDashboard: normalizeHomeDashboardPreferences(prefs.homeDashboard ?? DEFAULT_HOME_DASHBOARD_PREFERENCES),
    });

    // Sync theme with Electron on load
    if (typeof window !== 'undefined' && window.electron) {
      window.electron.setTheme(prefs.theme);
    }
  },

  updateTheme: async (theme) => {
    await saveTheme(theme);
    set({ theme });

    // Sync with Electron
    if (typeof window !== 'undefined' && window.electron) {
      window.electron.setTheme(theme);
    }
  },

  updateCitationStyle: async (style) => {
    await setCitationStyle(style);
    set({ citationStyle: style });
  },

  updatePreferences: async (preferences) => {
    await saveAppPreferences(preferences);
    set((state) => ({
      ...state,
      ...preferences,
      homeDashboard:
        preferences.homeDashboard !== undefined
          ? preferences.homeDashboard
          : state.homeDashboard,
    }));

    // Sync theme with Electron if it changed
    if (preferences.theme && typeof window !== 'undefined' && window.electron) {
      window.electron.setTheme(preferences.theme);
    }
  },

  updateHomeDashboard: async (next) => {
    const normalized = normalizeHomeDashboardPreferences(next);
    await saveAppPreferences({ homeDashboard: normalized });
    set({ homeDashboard: normalized });
  },
}));
