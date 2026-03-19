import { create } from 'zustand';

export type TabType =
  | 'home'
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
  | 'folder'
  | 'learn';

export interface DomeTab {
  id: string;
  type: TabType;
  title: string;
  resourceId?: string;
  pinned?: boolean;
}

export const HOME_TAB_ID = 'home';
export const SETTINGS_TAB_ID = 'settings';
export const CALENDAR_TAB_ID = 'calendar';
export const CHAT_TAB_PREFIX = 'chat:';
export const STUDIO_TAB_ID = 'studio';
export const FLASHCARDS_TAB_ID = 'flashcards';
export const LEARN_TAB_ID = 'learn';
export const TAGS_TAB_ID = 'tags';
export const MARKETPLACE_TAB_ID = 'marketplace';
export const AGENTS_TAB_ID = 'agents';
export const FOLDER_TAB_PREFIX = 'folder:';

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
  activateTab: (tabId: string) => void;
  replaceTabType: (tabId: string, newType: TabType) => void;
  openResourceTab: (resourceId: string, resourceType: string, title: string) => void;
  openSettingsTab: () => void;
  openCalendarTab: () => void;
  openChatTab: (sessionId: string, title: string) => void;
  openStudioTab: () => void;
  openFlashcardsTab: () => void;
  openLearnTab: () => void;
  openTagsTab: () => void;
  openMarketplaceTab: () => void;
  openAgentsTab: () => void;
  openFolderTab: (folderId: string, title: string) => void;
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

      // For singleton tabs (settings, calendar, studio, flashcards, tags, marketplace, agents, learn), focus existing one
      const singletonTypes: TabType[] = ['settings', 'calendar', 'studio', 'flashcards', 'tags', 'marketplace', 'agents', 'learn'];
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
        const existing = tabs.find((t) => t.resourceId === tabSpec.resourceId);
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
        pdf: 'resource',
        image: 'resource',
        audio: 'resource',
        video: 'resource',
        default: 'resource',
      };
      const tabType: TabType = typeMap[resourceType] ?? 'resource';
      get().openTab({ type: tabType, title, resourceId });
    },

    openSettingsTab: () => {
      get().openTab({ id: SETTINGS_TAB_ID, type: 'settings', title: 'Settings', pinned: false });
    },

    openCalendarTab: () => {
      get().openTab({ id: CALENDAR_TAB_ID, type: 'calendar', title: 'Calendario', pinned: false });
    },

    openChatTab: (sessionId: string, title: string) => {
      get().openTab({ id: CHAT_TAB_PREFIX + sessionId, type: 'chat', title: title || 'New chat', resourceId: sessionId, pinned: false });
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
      get().openTab({ id: AGENTS_TAB_ID, type: 'agents', title: 'Agentes & Flows', pinned: false });
    },

    openFolderTab: (folderId, title) => {
      get().openTab({ id: FOLDER_TAB_PREFIX + folderId, type: 'folder', title, resourceId: folderId });
    },
  };
});
