import { create } from 'zustand';
import type { Project, Resource, Source, Tag, AppPreferences, CitationStyle, StudioOutput, GraphViewState } from '@/types';
import { getAppPreferences, saveAppPreferences, setTheme as saveTheme, setCitationStyle } from '../settings';

interface AppState {
  // Proyectos
  projects: Project[];
  currentProject: Project | null;
  setProjects: (projects: Project[]) => void;
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
  homeSidebarSection: 'library' | 'flashcards' | 'chat' | 'projects' | 'recent' | 'tags' | 'studio';
  setHomeSidebarSection: (section: 'library' | 'flashcards' | 'chat' | 'projects' | 'recent' | 'tags' | 'studio') => void;
  homeSidebarCollapsed: boolean;
  toggleHomeSidebar: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: { resources: any[]; interactions: any[]; studioOutputs?: any[] } | null;
  setSearchResults: (data: { resources: any[]; interactions: any[]; studioOutputs?: any[] } | null) => void;
  commandCenterOpen: boolean;
  setCommandCenterOpen: (open: boolean) => void;
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;

  // Workspace Panel State
  sourcesPanelOpen: boolean;
  studioPanelOpen: boolean;
  graphPanelOpen: boolean;
  selectedSourceIds: string[];
  toggleSourcesPanel: () => void;
  toggleStudioPanel: () => void;
  toggleGraphPanel: () => void;
  setSelectedSourceIds: (ids: string[]) => void;
  toggleSourceId: (id: string) => void;
  selectAllSources: (ids: string[]) => void;
  deselectAllSources: () => void;

  // Graph View State
  graphState?: GraphViewState;
  setGraphState: (state: GraphViewState | undefined) => void;

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

  // Preference Actions
  loadPreferences: () => Promise<void>;
  updateTheme: (theme: 'light' | 'dark' | 'auto') => Promise<void>;
  updateCitationStyle: (style: CitationStyle) => Promise<void>;
  updatePreferences: (preferences: Partial<AppPreferences>) => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  // Proyectos
  projects: [],
  currentProject: null,
  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) => set({ currentProject: project }),
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
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  searchResults: null,
  setSearchResults: (data) => set({ searchResults: data }),
  commandCenterOpen: false,
  setCommandCenterOpen: (open) => set({ commandCenterOpen: open }),
  viewMode: 'grid',
  setViewMode: (mode) => set({ viewMode: mode }),

  // Workspace Panel State
  sourcesPanelOpen: true,
  studioPanelOpen: false,
  graphPanelOpen: false,
  selectedSourceIds: [],
  toggleSourcesPanel: () => set((state) => ({ sourcesPanelOpen: !state.sourcesPanelOpen })),
  toggleStudioPanel: () => set((state) => ({
    studioPanelOpen: !state.studioPanelOpen,
    // Mutual exclusion: close graph panel when opening studio
    graphPanelOpen: !state.studioPanelOpen ? false : state.graphPanelOpen,
  })),
  toggleGraphPanel: () => set((state) => ({
    graphPanelOpen: !state.graphPanelOpen,
    // Mutual exclusion: close studio panel when opening graph
    studioPanelOpen: !state.graphPanelOpen ? false : state.studioPanelOpen,
  })),
  setSelectedSourceIds: (ids) => set({ selectedSourceIds: ids }),
  toggleSourceId: (id) => set((state) => ({
    selectedSourceIds: state.selectedSourceIds.includes(id)
      ? state.selectedSourceIds.filter((sid) => sid !== id)
      : [...state.selectedSourceIds, id]
  })),
  selectAllSources: (ids) => set({ selectedSourceIds: ids }),
  deselectAllSources: () => set({ selectedSourceIds: [] }),

  // Graph View State
  graphState: undefined,
  setGraphState: (state) => set({ graphState: state }),

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
  theme: 'auto',
  citationStyle: 'apa',
  autoSave: true,
  autoBackup: true,
  shortcuts: undefined,

  // Preference Actions
  loadPreferences: async () => {
    const prefs = await getAppPreferences();
    set({
      theme: prefs.theme,
      citationStyle: prefs.citationStyle,
      autoSave: prefs.autoSave,
      autoBackup: prefs.autoBackup,
      shortcuts: prefs.shortcuts,
    });
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
    }));

    // Sync theme with Electron if it changed
    if (preferences.theme && typeof window !== 'undefined' && window.electron) {
      window.electron.setTheme(preferences.theme);
    }
  },
}));
