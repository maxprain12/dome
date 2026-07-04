import { create } from 'zustand';
import i18n from '@/lib/i18n';
import { migrateFolderHistory, removeFolderHistory } from '@/lib/folder/folderNavigationHistory';
import { useAppStore } from '@/lib/store/useAppStore';

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
  | 'github'
  | 'email'
  | 'social'
  | 'studio'
  | 'flashcards'
  | 'tags'
  | 'marketplace'
  | 'pipelines'
  // Deprecated: collapsed into 'pipelines'. Kept for backward-compatible tab restore.
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
  /**
   * Owning project id for project-scoped tabs (resource, note, folder, etc.).
   * When the active project changes, tabs with a different projectId are
   * auto-closed by `closeProjectTabs` so documents generated in one project
   * do not leak into the tab bar of another project. Global tabs (settings,
   * calendar, email, etc.) intentionally omit this field.
   */
  projectId?: string;
}

const RESOURCE_SOURCE_TAB_TYPES = new Set<TabType>([
  'note',
  'notebook',
  'resource',
  'url',
  'youtube',
  'ppt',
  'docx',
  'artifact',
]);

function syncSelectedSourceForTab(tab: Pick<DomeTab, 'type' | 'resourceId'> | undefined): void {
  if (tab?.resourceId && RESOURCE_SOURCE_TAB_TYPES.has(tab.type)) {
    useAppStore.getState().setSelectedSourceIds([tab.resourceId]);
  }
}

/**
 * Tabs that belong to a specific project. They must be closed when the
 * user switches to a different project, and must not be restored from
 * `localStorage` if their project no longer matches the active one.
 *
 * Global tabs (home, settings, calendar, chat, agents hub, etc.) are NOT
 * in this set and survive project switches.
 */
const PROJECT_SCOPED_TAB_TYPES: ReadonlySet<TabType> = new Set<TabType>([
  'resource',
  'note',
  'notebook',
  'url',
  'youtube',
  'docx',
  'ppt',
  'folder',
  'transcription-detail',
  'semantic-graph',
  'artifact',
]);

export function isProjectScopedTab(tab: DomeTab): boolean {
  return tab.projectId != null && PROJECT_SCOPED_TAB_TYPES.has(tab.type);
}

/**
 * Hub / sidebar navigation tabs — live in the tab store for routing but are
 * not shown in DomeTabBar (UnifiedSidebar owns that navigation).
 */
export const SIDEBAR_NAV_TAB_TYPES: ReadonlySet<TabType> = new Set<TabType>([
  'home',
  'projects',
  'calendar',
  'github',
  'email',
  'social',
  'pipelines',
  'learn',
  'marketplace',
  'tags',
  'settings',
  'studio',
  'flashcards',
  'agents',
  'workflows',
  'automations',
  'runs',
  'transcriptions',
]);

export function isTabStripVisible(tab: Pick<DomeTab, 'type'>): boolean {
  return !SIDEBAR_NAV_TAB_TYPES.has(tab.type);
}

export const HOME_TAB_ID = 'home';
export const PROJECTS_TAB_ID = 'projects';
export const SETTINGS_TAB_ID = 'settings';
export const CALENDAR_TAB_ID = 'calendar';
export const GITHUB_TAB_ID = 'github';
export const EMAIL_TAB_ID = 'email';
export const SOCIAL_TAB_ID = 'social';
export const CHAT_TAB_PREFIX = 'chat:';
export const STUDIO_TAB_ID = 'studio';
export const FLASHCARDS_TAB_ID = 'flashcards';
export const LEARN_TAB_ID = 'learn';
export const TAGS_TAB_ID = 'tags';
export const MARKETPLACE_TAB_ID = 'marketplace';
export const PIPELINES_TAB_ID = 'pipelines';
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

function loadStoredTabs(activeProjectId?: string | null): { tabs: DomeTab[]; activeTabId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        let storedTabs = parsed.tabs as DomeTab[];
        // Drop project-scoped tabs from a different project so documents
        // generated in project A never resurface when the user reopens
        // Dome in project B. Unscoped tabs (settings, calendar, …) survive.
        if (activeProjectId != null) {
          storedTabs = storedTabs.filter(
            (t) => !isProjectScopedTab(t) || t.projectId === activeProjectId,
          );
        }
        // Ensure the home tab is always present (pinned, must survive any cleanup)
        const hasHome = storedTabs.some((t) => t.id === HOME_TAB_ID);
        const tabs = hasHome ? storedTabs : [HOME_TAB, ...storedTabs];
        // Ensure activeTabId points to an existing tab so ContentRouter never
        // shows an endless <Loading /> spinner on startup
        const storedActiveId = parsed.activeTabId ?? HOME_TAB_ID;
        const activeTabId = tabs.some((t) => t.id === storedActiveId)
          ? storedActiveId
          : HOME_TAB_ID;
        return { tabs, activeTabId };
      }
      if (Array.isArray(parsed.tabs) && parsed.tabs.length === 0) {
        return { tabs: [HOME_TAB], activeTabId: HOME_TAB_ID };
      }
    }
  } catch {
    // ignore
  }
  return { tabs: [HOME_TAB], activeTabId: HOME_TAB_ID };
}

function saveTabs(tabs: DomeTab[], activeTabId: string) {
  try {
    // Persist only the activeTabId and global tabs. Project-scoped tabs
    // are intentionally excluded so they cannot be restored in a different
    // project after a hard reload.
    const persistable = tabs.filter((t) => !isProjectScopedTab(t));
    const persistableActive = persistable.some((t) => t.id === activeTabId)
      ? activeTabId
      : persistable[0]?.id ?? HOME_TAB_ID;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs: persistable, activeTabId: persistableActive }));
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
  /**
   * Close every project-scoped tab that belongs to `projectId`. Called when
   * the user switches projects so documents generated in the previous project
   * do not remain visible in the tab bar. Global tabs (home, settings, …) and
   * tabs owned by other projects are preserved.
   */
  closeProjectTabs: (projectId: string) => void;
  /**
   * Close every project-scoped tab that does NOT belong to `activeProjectId`.
   * Unlike `closeProjectTabs` (which targets a single owner), this enforces that
   * only the active project's documents remain open — used on project switch and
   * on mount so foreign-vault tabs never linger.
   */
  closeForeignProjectTabs: (activeProjectId: string) => void;
  togglePinTab: (tabId: string) => void;
  duplicateTab: (tabId: string) => void;
  activateTab: (tabId: string) => void;
  replaceTabType: (tabId: string, newType: TabType) => void;
  openResourceTab: (resourceId: string, resourceType: string, title: string, projectId?: string) => void;
  openResourceInSplit: (resourceId: string, resourceType: string, title: string, tabId?: string, projectId?: string) => void;
  closeSplit: (tabId?: string) => void;
  resizeSplit: (width: number, tabId?: string) => void;
  swapSplit: (tabId?: string) => void;
  openNoteTab: (resourceId: string, title: string, projectId?: string) => void;
  openSettingsTab: () => void;
  openCalendarTab: () => void;
  openGitHubTab: () => void;
  openEmailTab: () => void;
  openSocialTab: () => void;
  openChatTab: (sessionId: string, title: string) => void;
  openStudioTab: () => void;
  openFlashcardsTab: () => void;
  openLearnTab: () => void;
  openTagsTab: () => void;
  openMarketplaceTab: () => void;
  openPipelinesTab: () => void;
  openAgentsTab: () => void;
  openWorkflowsTab: () => void;
  openAutomationsTab: () => void;
  openRunsTab: () => void;
  openProjectsTab: () => void;
  openFolderTab: (folderId: string, title: string, color?: string, projectId?: string) => void;
  navigateFolderTab: (fromTabId: string, location: { id: string; title: string; color?: string }, projectId?: string) => void;
  openTranscriptionsTab: () => void;
  openTranscriptionDetailTab: (noteId: string, title: string, projectId?: string) => void;
  openSemanticGraphTab: (focusResourceId?: string, projectId?: string) => void;
  openArtifactTab: (title: string, artifactJson: string, projectId?: string) => void;
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
        syncSelectedSourceForTab(existingById);
        return;
      }

      // For singleton tabs (settings, calendar, studio, flashcards, tags, marketplace, agents hub tabs, learn), focus existing one
      const singletonTypes: TabType[] = [
        'settings',
        'calendar',
        'github',
        'email',
        'social',
        'studio',
        'flashcards',
        'tags',
        'marketplace',
        'pipelines',
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
          syncSelectedSourceForTab(existing);
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
          syncSelectedSourceForTab(existing);
          return;
        }
      }

      const newTab: DomeTab = { ...tabSpec, id };
      const newTabs = [...tabs, newTab];
      set({ tabs: newTabs, activeTabId: id });
      saveTabs(newTabs, id);
      syncSelectedSourceForTab(newTab);
    },

    closeTab: (tabId) => {
      const { tabs, activeTabId } = get();
      if (tabs.find((t) => t.id === tabId)?.pinned) return;

      if (tabId.startsWith(FOLDER_TAB_PREFIX)) {
        removeFolderHistory(tabId);
      }

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

    closeProjectTabs: (projectId) => {
      const { tabs, activeTabId } = get();
      // Drop only project-scoped tabs owned by `projectId`. Tabs without a
      // projectId (global) and tabs owned by other projects are kept.
      const remaining = tabs.filter(
        (t) => !(isProjectScopedTab(t) && t.projectId === projectId),
      );
      if (remaining.length === tabs.length) return;

      let newActiveId = activeTabId;
      if (!remaining.some((t) => t.id === newActiveId)) {
        // The active tab was just closed; pick a sensible fallback.
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        newActiveId = remaining[Math.min(idx >= 0 ? idx : 0, remaining.length - 1)]?.id ?? HOME_TAB_ID;
      }

      if (remaining.length === 0) {
        const fallback = [HOME_TAB];
        set({ tabs: fallback, activeTabId: HOME_TAB_ID });
        saveTabs(fallback, HOME_TAB_ID);
        return;
      }

      set({ tabs: remaining, activeTabId: newActiveId });
      saveTabs(remaining, newActiveId);
    },

    closeForeignProjectTabs: (activeProjectId) => {
      const { tabs, activeTabId } = get();
      // A project-scoped *type* must be owned by the active project to stay.
      // Tabs of a scoped type with a different projectId — or with no projectId
      // at all (legacy/untagged) — can't be confirmed as the active project's,
      // so they are closed. Global tab types are always kept.
      const remaining = tabs.filter((t) => {
        if (!PROJECT_SCOPED_TAB_TYPES.has(t.type)) return true;
        return t.projectId === activeProjectId;
      });
      if (remaining.length === tabs.length) return;

      let newActiveId = activeTabId;
      if (!remaining.some((t) => t.id === newActiveId)) {
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        newActiveId = remaining[Math.min(idx >= 0 ? idx : 0, remaining.length - 1)]?.id ?? HOME_TAB_ID;
      }

      if (remaining.length === 0) {
        const fallback = [HOME_TAB];
        set({ tabs: fallback, activeTabId: HOME_TAB_ID });
        saveTabs(fallback, HOME_TAB_ID);
        return;
      }

      set({ tabs: remaining, activeTabId: newActiveId });
      saveTabs(remaining, newActiveId);
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
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      set({ activeTabId: tabId });
      saveTabs(tabs, tabId);
      syncSelectedSourceForTab(tab);
    },

    replaceTabType: (tabId, newType) => {
      const { tabs, activeTabId } = get();
      const newTabs = tabs.map((t) => t.id === tabId ? { ...t, type: newType } : t);
      set({ tabs: newTabs });
      saveTabs(newTabs, activeTabId);
    },

    openResourceTab: (resourceId, resourceType, title, projectId) => {
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
        artifact: 'artifact',
        default: 'resource',
      };
      const tabType: TabType = typeMap[resourceType] ?? 'resource';
      get().openTab({ type: tabType, title, resourceId, ...(projectId ? { projectId } : {}) });
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

    openResourceInSplit: (resourceId, resourceType, title, tabId, _projectId) => {
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
        artifact: 'artifact',
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

    openNoteTab: (resourceId, title, projectId) => {
      get().openTab({ type: 'note', title, resourceId, ...(projectId ? { projectId } : {}) });
    },

    openSettingsTab: () => {
      get().openTab({ id: SETTINGS_TAB_ID, type: 'settings', title: 'Settings', pinned: false });
    },

    openGitHubTab: () => {
      get().openTab({ id: GITHUB_TAB_ID, type: 'github', title: i18n.t('github.tab_title'), pinned: false });
    },
    openCalendarTab: () => {
      get().openTab({ id: CALENDAR_TAB_ID, type: 'calendar', title: i18n.t('tabs.calendar'), pinned: false });
    },
    openEmailTab: () => {
      get().openTab({ id: EMAIL_TAB_ID, type: 'email', title: i18n.t('email.tab_title'), pinned: false });
    },
    openSocialTab: () => {
      get().openTab({ id: SOCIAL_TAB_ID, type: 'social', title: i18n.t('social.tab_title'), pinned: false });
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
      const { currentProject } = useAppStore.getState();
      const id = currentProject?.id ?? 'default';
      const title = currentProject?.name ?? 'Dome';
      get().openFolderTab(id, title, undefined, id);
    },

    openMarketplaceTab: () => {
      get().openTab({ id: MARKETPLACE_TAB_ID, type: 'marketplace', title: 'Marketplace', pinned: false });
    },

    openPipelinesTab: () => {
      get().openTab({ id: PIPELINES_TAB_ID, type: 'pipelines', title: i18n.t('tabs.pipelines'), pinned: false });
    },

    // The agents/workflows/automations/runs experiences were unified into
    // Pipelines. These openers are kept as aliases so existing callers keep
    // working; they all focus the single Pipelines tab.
    openAgentsTab: () => {
      get().openPipelinesTab();
    },

    openWorkflowsTab: () => {
      get().openPipelinesTab();
    },

    openAutomationsTab: () => {
      get().openPipelinesTab();
    },

    openRunsTab: () => {
      get().openPipelinesTab();
    },

    openProjectsTab: () => {
      get().openTab({
        id: PROJECTS_TAB_ID,
        type: 'projects',
        title: i18n.t('tabs.projects'),
        pinned: false,
      });
    },

    openFolderTab: (folderId, title, color, projectId) => {
      const tabId = FOLDER_TAB_PREFIX + folderId;
      const existing = get().tabs.find((t) => t.id === tabId);
      if (existing) {
        get().activateTab(tabId);
        return;
      }
      get().openTab({
        id: tabId,
        type: 'folder',
        title,
        resourceId: folderId,
        color,
        ...(projectId ? { projectId } : {}),
      });
    },

    navigateFolderTab: (fromTabId, location, projectId) => {
      const newTabId = FOLDER_TAB_PREFIX + location.id;
      if (fromTabId === newTabId) return;

      let { tabs, activeTabId } = get();
      const fromIdx = tabs.findIndex((t) => t.id === fromTabId);
      if (fromIdx === -1) return;

      const existingIdx = tabs.findIndex((t) => t.id === newTabId);
      if (existingIdx !== -1 && existingIdx !== fromIdx) {
        tabs = tabs.filter((t) => t.id !== fromTabId);
        migrateFolderHistory(fromTabId, newTabId);
        set({ tabs, activeTabId: newTabId });
        saveTabs(tabs, newTabId);
        return;
      }

      const updatedTab: DomeTab = {
        ...tabs[fromIdx],
        id: newTabId,
        resourceId: location.id,
        title: location.title,
        ...(location.color ? { color: location.color } : {}),
        ...(projectId ? { projectId } : (tabs[fromIdx].projectId ? {} : {})),
      };
      const newTabs = [...tabs];
      newTabs[fromIdx] = updatedTab;
      if (activeTabId === fromTabId) activeTabId = newTabId;
      migrateFolderHistory(fromTabId, newTabId);
      set({ tabs: newTabs, activeTabId });
      saveTabs(newTabs, activeTabId);
    },

    openTranscriptionsTab: () => {
      get().openTab({
        id: TRANSCRIPTIONS_TAB_ID,
        type: 'transcriptions',
        title: i18n.t('transcriptions.tab_title'),
        pinned: false,
      });
    },

    openTranscriptionDetailTab: (noteId, title, projectId) => {
      get().openTab({
        type: 'transcription-detail',
        title: title.trim() || i18n.t('transcriptions.tab_title'),
        resourceId: noteId,
        pinned: false,
        ...(projectId ? { projectId } : {}),
      });
    },

    openSemanticGraphTab: (focusResourceId, projectId) => {
      get().openTab({
        type: 'semantic-graph',
        title: focusResourceId
          ? i18n.t('semantic_graph.tab_title_focus')
          : i18n.t('semantic_graph.tab_title'),
        resourceId: focusResourceId,
        pinned: false,
        ...(projectId ? { projectId } : {}),
      });
    },

    openArtifactTab: (title, artifactJson, projectId) => {
      let resourceId: string | undefined;
      try {
        const parsed = JSON.parse(artifactJson) as { resource_id?: string; resourceId?: string };
        resourceId = parsed.resourceId || parsed.resource_id;
      } catch {
        resourceId = undefined;
      }
      if (resourceId) {
        get().openResourceTab(resourceId, 'artifact', title.trim() || i18n.t('chat.artifact_tab'), projectId);
        return;
      }
      get().openTab({
        type: 'artifact',
        title: title.trim() || i18n.t('chat.artifact_tab'),
        artifactPayload: artifactJson,
        pinned: false,
        ...(projectId ? { projectId } : {}),
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
