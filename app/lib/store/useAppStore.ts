import { create } from 'zustand';
import type { Project, Resource, Source, Tag, AppPreferences, CitationStyle } from '@/types';
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
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: { resources: any[]; interactions: any[] } | null;
  setSearchResults: (data: { resources: any[]; interactions: any[] } | null) => void;
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;

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
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  searchResults: null,
  setSearchResults: (data) => set({ searchResults: data }),
  viewMode: 'grid',
  setViewMode: (mode) => set({ viewMode: mode }),

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
