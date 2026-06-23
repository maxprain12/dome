import { create } from 'zustand';
import { githubClient } from '@/lib/github/client';

type SyncStatus = 'idle' | 'syncing' | 'error';

// Module-private state so it never triggers React re-renders.
// Keeps the IPC unsubscribers + a debounce handle so GitHubView mount/unmount
// cycles don't leak listeners or fan out N× full-data reloads per broadcast.
let _unsubSyncStatus: (() => void) | null = null;
let _unsubDataUpdated: (() => void) | null = null;
let _subscribed = false;
let _refreshDebounce: ReturnType<typeof setTimeout> | null = null;
const REFRESH_DEBOUNCE_MS = 500;

interface GitHubState {
  connected: boolean;
  login: string | null;
  checkingAuth: boolean;

  repos: GitHubRepoRow[];
  selectedRepoId: string | null;

  milestones: GitHubMilestoneRow[];
  issues: GitHubIssueRow[];
  branches: GitHubBranchRow[];
  releases: GitHubReleaseRow[];

  syncStatus: SyncStatus;
  lastSync: number | null;
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  /** Tear down IPC subscriptions — call on view unmount to avoid listener leaks. */
  dispose: () => void;
  refreshStatus: () => Promise<void>;
  refreshRepos: () => Promise<void>;
  selectRepo: (repoId: string) => Promise<void>;
  toggleRepoSelected: (repoId: string, selected: boolean) => Promise<void>;
  loadRepoData: (repoId: string) => Promise<void>;
  syncNow: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export const useGitHubStore = create<GitHubState>((set, get) => ({
  connected: false,
  login: null,
  checkingAuth: true,
  repos: [],
  selectedRepoId: null,
  milestones: [],
  issues: [],
  branches: [],
  releases: [],
  syncStatus: 'idle',
  lastSync: null,
  loading: false,
  error: null,

  init: async () => {
    await get().refreshStatus();

    // Subscribe exactly once: GitHubView can mount in the main window AND in
    // popout windows, and navigation remounts it. Without this guard every
    // mount leaked two permanent ipcRenderer listeners, and each stale one
    // re-fetched the full dataset on every broadcast (N× amplification).
    if (!_subscribed) {
      _subscribed = true;
      _unsubSyncStatus = githubClient.onSyncStatus((d) => {
        set({
          syncStatus: (d.status as SyncStatus) || 'idle',
          lastSync: d.lastSync ?? get().lastSync,
          error: d.error ?? null,
        });
      });
      // Debounce the data-updated reload: the main process broadcasts once per
      // repo during a sync, so a multi-repo sync fired N reloads per window.
      // Collapse a burst into a single refresh.
      _unsubDataUpdated = githubClient.onDataUpdated(() => {
        if (_refreshDebounce) clearTimeout(_refreshDebounce);
        _refreshDebounce = setTimeout(() => {
          _refreshDebounce = null;
          void get().refreshRepos();
          const id = get().selectedRepoId;
          if (id) void get().loadRepoData(id);
        }, REFRESH_DEBOUNCE_MS);
      });
    }

    if (get().connected) await get().refreshRepos();
  },

  dispose: () => {
    if (_refreshDebounce) {
      clearTimeout(_refreshDebounce);
      _refreshDebounce = null;
    }
    _unsubSyncStatus?.();
    _unsubDataUpdated?.();
    _unsubSyncStatus = null;
    _unsubDataUpdated = null;
    _subscribed = false;
  },

  refreshStatus: async () => {
    const res = await githubClient.auth.status();
    set({ connected: !!res.connected, login: res.login ?? null, checkingAuth: false });
  },

  refreshRepos: async () => {
    const res = await githubClient.repos.list();
    if (res.success && res.repos) {
      set({ repos: res.repos });
      const selectedId = get().selectedRepoId;
      const firstSelected = res.repos.find((r) => r.selected) ?? null;
      if (!selectedId && firstSelected) void get().selectRepo(firstSelected.id);
    }
  },

  selectRepo: async (repoId) => {
    set({ selectedRepoId: repoId });
    await get().loadRepoData(repoId);
  },

  toggleRepoSelected: async (repoId, selected) => {
    await githubClient.repos.setSelected(repoId, selected);
    await get().refreshRepos();
    if (selected) await get().selectRepo(repoId);
  },

  loadRepoData: async (repoId) => {
    set({ loading: true, error: null });
    try {
      const [ms, iss, br, rel] = await Promise.all([
        githubClient.milestones.list(repoId),
        githubClient.issues.list(repoId),
        githubClient.branches.list(repoId),
        githubClient.releases.list(repoId),
      ]);
      set({
        milestones: ms.milestones ?? [],
        issues: iss.issues ?? [],
        branches: br.branches ?? [],
        releases: rel.releases ?? [],
        loading: false,
      });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  syncNow: async () => {
    set({ syncStatus: 'syncing' });
    const res = await githubClient.syncNow();
    if (!res.success) set({ syncStatus: 'error', error: res.error ?? 'Sync failed' });
    await get().refreshRepos();
    const id = get().selectedRepoId;
    if (id) await get().loadRepoData(id);
  },

  disconnect: async () => {
    await githubClient.auth.disconnect();
    set({
      connected: false,
      login: null,
      repos: [],
      selectedRepoId: null,
      milestones: [],
      issues: [],
      branches: [],
      releases: [],
    });
  },
}));
