import { create } from 'zustand';
import i18n from '@/lib/i18n';

export type TabType =
  | 'home'
  | 'projects'
  | 'note'
  | 'notebook'
  | 'resource'
  | 'url'
  | 'youtube'
  | 'docx'
  | 'ppt'
  | 'settings'
  | 'chat'
  | 'calendar'
  | 'studio'
  | 'flashcards'
  | 'tags'
  | 'marketplace'
  | 'agents'
  | 'workflows'
  | 'automations'
  | 'runs'
  | 'folder'
  | 'learn'
  | 'transcriptions'
  | 'transcription-detail'
  | 'semantic-graph'
  | 'artifact';

export interface DomeTab {
  id: string;
  type: TabType;
  title: string;
  resourceId?: string;
  splitResource?: {
    resourceId: string;
    resourceType: string;
    title: string;
  };
  splitWidth?: number;
  splitOpen?: boolean;
  /** JSON string of chat artifact for type === 'artifact' */
  artifactPayload?: string;
  pinned?: boolean;
  color?: string;
}

export const HOME_TAB_ID = 'home';
export const PROJECTS_TAB_ID = 'projects';
export const SETTINGS_TAB_ID = 'settings';
export const CALENDAR_TAB_ID = 'calendar';
export const CHAT_TAB_PREFIX = 'chat:';
export const STUDIO_TAB_ID = 'studio';
export const FLASHCARDS_TAB_ID = 'flashcards';
export const LEARN_TAB_ID = 'learn';
export const TAGS_TAB_ID = 'tags';
export const MARKETPLACE_TAB_ID = 'marketplace';
export const AGENTS_TAB_ID = 'agents';
export const WORKFLOWS_TAB_ID = 'workflows';
export const AUTOMATIONS_TAB_ID = 'automations';
export const RUNS_TAB_ID = 'runs';
export const FOLDER_TAB_PREFIX = 'folder:';
export const TRANSCRIPTIONS_TAB_ID = 'transcriptions';

const HOME_TAB: DomeTab = { id: HOME_TAB_ID, type: 'home', title: 'Home', pinned: true };

function generateTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const STORAGE_KEY = 'dome:tabs-v1';

function loadStoredTabs(): { tabs: DomeTab[]; activeTabId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        return { tabs: parsed.tabs, activeTabId: parsed.activeTabId ?? HOME_TAB_ID };
      }
    }
  } catch {
    // ignore
  }
  return { tabs: [HOME_TAB], activeTabId: HOME_TAB_ID };
}

function saveTabs(tabs: DomeTab[], activeTabId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }));
  } catch {
    // ignore
  }
}

interface TabStore {
  tabs: DomeTab[];
  activeTabId: string;
  openTab: (tab: Omit<DomeTab, 'id'> & { id?: string }) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (keepTabId: string) => void;
  closeTabsToTheRight: (tabId: string) => void;
  closeAllUnpinnedTabs: () => void;
  closeAllTabsToHome: () => void;
  togglePinTab: (tabId: string) => void;
  duplicateTab: (tabId: string) => void;
  activateTab: (tabId: string) => void;
  replaceTabType: (tabId: string, newType: TabType) => void;
  openResourceTab: (resourceId: string, resourceType: string, title: string) => void;
  openResourceInSplit: (resourceId: string, resourceType: string, title: string, tabId?: string) => void;
  closeSplit: (tabId?: string) => void;
  resizeSplit: (width: number, tabId?: string) => void;
  swapSplit: (tabId?: string) => void;
  openNoteTab: (resourceId: string, title: string) => void;
  openSettingsTab: () => void;
  openCalendarTab: () => void;
  openChatTab: (sessionId: string, title: string) => void;
  openStudioTab: () => void;
  openFlashcardsTab: () => void;
  openLearnTab: () => void;
  openTagsTab: () => void;
  openMarketplaceTab: () => void;
  openAgentsTab: () => void;
  openWorkflowsTab: () => void;
  openAutomationsTab: () => void;
  openRunsTab: () => void;
  openProjectsTab: () => void;
  openFolderTab: (folderId: string, title: string, color?: string) => void;
  openTranscriptionsTab: () => void;
  openTranscriptionDetailTab: (noteId: string, title: string) => void;
  openSemanticGraphTab: (focusResourceId?: string) => void;
  openArtifactTab: (title: string, artifactJson: string) => void;
  updateTab: (tabId: string, updates: Partial<Pick<DomeTab, 'title' | 'color'>>) => void;
}

export const useTabStore = create<TabStore>((set, get) => {
  const initial = loadStoredTabs();

  return {
    tabs: initial.tabs,
    activeTabId: initial.activeTabId,

    openTab: (tabSpec) => {
      const { tabs } = get();
      const id = tabSpec.id ?? generateTabId();

      // Check if a tab with this id or matching singleton (settings, home, calendar, chat) already exists
      const existingById = tabs.find((t) => t.id === id);
      if (existingById) {
        set({ activeTabId: id });
        saveTabs(tabs, id);
        return;
      }

      // For singleton tabs (settings, calendar, studio, flashcards, tags, marketplace, agents hub tabs, learn), focus existing one
      const singletonTypes: TabType[] = [
        'settings',
        'calendar',
        'studio',
        'flashcards',
        'tags',
        'marketplace',
        'agents',
        'workflows',
        'automations',
        'runs',
        'learn',
        'projects',
        'transcriptions',
      ];
      if (singletonTypes.includes(tabSpec.type)) {
        const existing = tabs.find((t) => t.type === tabSpec.type);
        if (existing) {
          set({ activeTabId: existing.id });
          saveTabs(tabs, existing.id);
          return;
        }
      }

      // For resource tabs, focus existing one if same resourceId
      if (tabSpec.resourceId) {
        const existing = tabs.find(
          (t) => t.resourceId === tabSpec.resourceId && t.type === tabSpec.type,
        );
        if (existing) {
          set({ activeTabId: existing.id });
          saveTabs(tabs, existing.id);
          return;
        }
      }

      const newTab: DomeTab = { ...tabSpec, id };
      const newTabs = [...tabs, newTab];
      set({ tabs: newTabs, activeTabId: id });
      saveTabs(newTabs, id);
    },

    closeTab: (tabId) => {
      const { tabs, activeTabId } = get();
      if (tabs.find((t) => t.id === tabId)?.pinned) return;

      const filtered = tabs.filter((t) => t.id !== tabId);
      if (filtered.length === 0) {
        const newTabs = [HOME_TAB];
        set({ tabs: newTabs, activeTabId: HOME_TAB_ID });
        saveTabs(newTabs, HOME_TAB_ID);
        return;
      }

      let newActiveId = activeTabId;
      if (activeTabId === tabId) {
        const idx = tabs.findIndex((t) => t.id === tabId);
        const fallback = filtered[Math.min(idx, filtered.length - 1)];
        newActiveId = fallback?.id ?? HOME_TAB_ID;
      }

      set({ tabs: filtered, activeTabId: newActiveId });
      saveTabs(filtered, newActiveId);
    },

    closeOtherTabs: (keepTabId) => {
      const { tabs, activeTabId } = get();
      const newTabs = tabs.filter((t) => t.id === keepTabId || t.pinned);
      if (newTabs.length === 0) {
        const fallback = [HOME_TAB];
        set({ tabs: fallback, activeTabId: HOME_TAB_ID });
        saveTabs(fallback, HOME_TAB_ID);
        return;
      }
      const stillActive = newTabs.some((t) => t.id === activeTabId);
      const newActiveId = stillActive ? activeTabId : (newTabs.find((t) => t.id === keepTabId)?.id ?? newTabs[newTabs.length - 1]!.id);
      set({ tabs: newTabs, activeTabId: newActiveId });
      saveTabs(newTabs, newActiveId);
    },

    closeTabsToTheRight: (tabId) => {
      const { tabs, activeTabId } = get();
      const idx = tabs.findIndex((t) => t.id === tabId);
      if (idx < 0) return;
      const newTabs = tabs.filter((t, i) => i <= idx || t.pinned);
      if (newTabs.length === 0) {
        const fallback = [HOME_TAB];
        set({ tabs: fallback, activeTabId: HOME_TAB_ID });
        saveTabs(fallback, HOME_TAB_ID);
        return;
      }
      const stillActive = newTabs.some((t) => t.id === activeTabId);
      let newActiveId = activeTabId;
      if (!stillActive) {
        const fb = newTabs[Math.min(idx, newTabs.length - 1)];
        newActiveId = fb?.id ?? HOME_TAB_ID;
      }
      set({ tabs: newTabs, activeTabId: newActiveId });
      saveTabs(newTabs, newActiveId);
    },

    closeAllUnpinnedTabs: () => {
      const { tabs, activeTabId } = get();
      let newTabs = tabs.filter((t) => t.pinned);
      if (newTabs.length === 0) {
        newTabs = [HOME_TAB];
        set({ tabs: newTabs, activeTabId: HOME_TAB_ID });
        saveTabs(newTabs, HOME_TAB_ID);
        return;
      }
      const stillActive = newTabs.some((t) => t.id === activeTabId);
      const newActiveId = stillActive ? activeTabId : (newTabs[newTabs.length - 1]?.id ?? HOME_TAB_ID);
      set({ tabs: newTabs, activeTabId: newActiveId });
      saveTabs(newTabs, newActiveId);
    },

    closeAllTabsToHome: () => {
      const newTabs = [HOME_TAB];
      set({ tabs: newTabs, activeTabId: HOME_TAB_ID });
      saveTabs(newTabs, HOME_TAB_ID);
    },

    togglePinTab: (tabId) => {
      if (tabId === HOME_TAB_ID) return;
      const { tabs, activeTabId } = get();
      const newTabs = tabs.map((t) =>
        t.id === tabId ? { ...t, pinned: !t.pinned } : t,
      );
      set({ tabs: newTabs });
      saveTabs(newTabs, activeTabId);
    },

    duplicateTab: (tabId) => {
      const { tabs } = get();
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const id = generateTabId();
      const copy: DomeTab = {
        ...tab,
        id,
        pinned: false,
      };
      const idx = tabs.findIndex((t) => t.id === tabId);
      const newTabs = [...tabs.slice(0, idx + 1), copy, ...tabs.slice(idx + 1)];
      set({ tabs: newTabs, activeTabId: id });
      saveTabs(newTabs, id);
    },

    activateTab: (tabId) => {
      const { tabs } = get();
      const exists = tabs.find((t) => t.id === tabId);
      if (!exists) return;
      set({ activeTabId: tabId });
      saveTabs(tabs, tabId);
    },

    replaceTabType: (tabId, newType) => {
      const { tabs, activeTabId } = get();
      const newTabs = tabs.map((t) => t.id === tabId ? { ...t, type: newType } : t);
      set({ tabs: newTabs });
      saveTabs(newTabs, activeTabId);
    },

    openResourceTab: (resourceId, resourceType, title) => {
      const typeMap: Record<string, TabType> = {
        note: 'note',
        notebook: 'notebook',
        url: 'url',
        youtube: 'youtube',
        docx: 'docx',
        ppt: 'ppt',
        document: 'resource',
        pdf: 'resource',
        image: 'resource',
        audio: 'resource',
        video: 'resource',
        excel: 'resource',
        default: 'resource',
      };
      const tabType: TabType = typeMap[resourceType] ?? 'resource';
      get().openTab({ type: tabType, title, resourceId });
      try {
        void window.electron?.invoke?.('automations:notifyContext', {
          tag: 'resource_opened',
          resourceId,
          resourceType,
        });
      } catch {
        /* non-Electron or older build */
      }
    },

    openResourceInSplit: (resourceId, resourceType, title, tabId) => {
      const { tabs, activeTabId } = get();
      const targetTabId = tabId ?? activeTabId;
      const newTabs = tabs.map((tab) => {
        if (tab.id !== targetTabId) return tab;
        return {
          ...tab,
          splitOpen: true,
          splitResource: { resourceId, resourceType, title },
          splitWidth: tab.splitWidth ?? 420,
        };
      });
      set({ tabs: newTabs });
      saveTabs(newTabs, activeTabId);
    },

    closeSplit: (tabId) => {
      const { tabs, activeTabId } = get();
      const targetTabId = tabId ?? activeTabId;
      const newTabs = tabs.map((tab) => {
        if (tab.id !== targetTabId) return tab;
        return { ...tab, splitOpen: false, splitResource: undefined };
      });
      set({ tabs: newTabs });
      saveTabs(newTabs, activeTabId);
    },

    resizeSplit: (width, tabId) => {
      const { tabs, activeTabId } = get();
      const targetTabId = tabId ?? activeTabId;
      const clamped = Math.max(320, Math.min(width, 760));
      const newTabs = tabs.map((tab) => (
        tab.id === targetTabId ? { ...tab, splitWidth: clamped } : tab
      ));
      set({ tabs: newTabs });
      saveTabs(newTabs, activeTabId);
    },

    swapSplit: (tabId) => {
      // Swap primary ↔ reference panes inside a split tab. No-op when the
      // tab has no resource or no open split (e.g. singleton tabs).
      const { tabs, activeTabId } = get();
      const targetTabId = tabId ?? activeTabId;
      // Mirror the mapping used in openResourceTab so we get a valid TabType
      // for the previously-referenced resource when it becomes the primary.
      const resourceTypeToTab: Record<string, TabType> = {
        note: 'note',
        notebook: 'notebook',
        url: 'url',
        youtube: 'youtube',
        docx: 'docx',
        ppt: 'ppt',
        document: 'resource',
        pdf: 'resource',
        image: 'resource',
        audio: 'resource',
        video: 'resource',
        excel: 'resource',
      };
      const newTabs = tabs.map((tab) => {
        if (tab.id !== targetTabId) return tab;
        if (!tab.splitResource || !tab.resourceId) return tab;
        const newPrimaryType: TabType = resourceTypeToTab[tab.splitResource.resourceType] ?? 'resource';
        // Generic resourceType string for the previous primary going to the
        // reference pane. Generic 'resource' tabs map back to 'document'.
        const oldGenericType = tab.type === 'resource' ? 'document' : tab.type;
        return {
          ...tab,
          type: newPrimaryType,
          resourceId: tab.splitResource.resourceId,
          title: tab.splitResource.title,
          splitResource: {
            resourceId: tab.resourceId,
            resourceType: oldGenericType,
            title: tab.title,
          },
        };
      });
      set({ tabs: newTabs });
      saveTabs(newTabs, activeTabId);
    },

    openNoteTab: (resourceId, title) => {
      get().openTab({ type: 'note', title, resourceId });
    },

    openSettingsTab: () => {
      get().openTab({ id: SETTINGS_TAB_ID, type: 'settings', title: 'Settings', pinned: false });
    },

    openCalendarTab: () => {
      get().openTab({ id: CALENDAR_TAB_ID, type: 'calendar', title: 'Calendario', pinned: false });
    },

    openChatTab: (sessionId: string, title: string) => {
      get().openTab({ id: CHAT_TAB_PREFIX + sessionId, type: 'chat', title: title.trim(), resourceId: sessionId, pinned: false });
    },

    openStudioTab: () => {
      get().openTab({ id: STUDIO_TAB_ID, type: 'studio', title: 'Studio', pinned: false });
    },

    openFlashcardsTab: () => {
      get().openTab({ id: FLASHCARDS_TAB_ID, type: 'flashcards', title: 'Flashcards', pinned: false });
    },

    openLearnTab: () => {
      get().openTab({ id: LEARN_TAB_ID, type: 'learn', title: 'Learn', pinned: false });
    },

    openTagsTab: () => {
      get().openTab({ id: TAGS_TAB_ID, type: 'tags', title: 'Tags', pinned: false });
    },

    openMarketplaceTab: () => {
      get().openTab({ id: MARKETPLACE_TAB_ID, type: 'marketplace', title: 'Marketplace', pinned: false });
    },

    openAgentsTab: () => {
      get().openTab({ id: AGENTS_TAB_ID, type: 'agents', title: 'Agents', pinned: false });
    },

    openWorkflowsTab: () => {
      get().openTab({ id: WORKFLOWS_TAB_ID, type: 'workflows', title: 'Workflows', pinned: false });
    },

    openAutomationsTab: () => {
      get().openTab({ id: AUTOMATIONS_TAB_ID, type: 'automations', title: 'Automations', pinned: false });
    },

    openRunsTab: () => {
      get().openTab({ id: RUNS_TAB_ID, type: 'runs', title: 'Runs', pinned: false });
    },

    openProjectsTab: () => {
      get().openTab({
        id: PROJECTS_TAB_ID,
        type: 'projects',
        title: i18n.t('tabs.projects'),
        pinned: false,
      });
    },

    openFolderTab: (folderId, title, color) => {
      const tabId = FOLDER_TAB_PREFIX + folderId;
      const existing = get().tabs.find((t) => t.id === tabId);
      if (existing) {
        get().activateTab(tabId);
        return;
      }
      get().openTab({ id: tabId, type: 'folder', title, resourceId: folderId, color });
    },

    openTranscriptionsTab: () => {
      get().openTab({
        id: TRANSCRIPTIONS_TAB_ID,
        type: 'transcriptions',
        title: i18n.t('transcriptions.tab_title'),
        pinned: false,
      });
    },

    openTranscriptionDetailTab: (noteId, title) => {
      get().openTab({
        type: 'transcription-detail',
        title: title.trim() || i18n.t('transcriptions.tab_title'),
        resourceId: noteId,
        pinned: false,
      });
    },

    openSemanticGraphTab: (focusResourceId) => {
      get().openTab({
        type: 'semantic-graph',
        title: focusResourceId
          ? i18n.t('semantic_graph.tab_title_focus')
          : i18n.t('semantic_graph.tab_title'),
        resourceId: focusResourceId,
        pinned: false,
      });
    },

    openArtifactTab: (title, artifactJson) => {
      get().openTab({
        type: 'artifact',
        title: title.trim() || i18n.t('chat.artifact_tab'),
        artifactPayload: artifactJson,
        pinned: false,
      });
    },

    updateTab: (tabId, updates) => {
      const { tabs, activeTabId } = get();
      const newTabs = tabs.map((t) => t.id === tabId ? { ...t, ...updates } : t);
      set({ tabs: newTabs });
      saveTabs(newTabs, activeTabId);
    },
  };
});
