import { create } from 'zustand';
import { githubClient } from '@/lib/github/client';

type SyncStatus = 'idle' | 'syncing' | 'error';

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
    // Live updates from the main-process sync.
    githubClient.onSyncStatus((d) => {
      set({ syncStatus: (d.status as SyncStatus) || 'idle', lastSync: d.lastSync ?? get().lastSync, error: d.error ?? null });
    });
    githubClient.onDataUpdated(() => {
      void get().refreshRepos();
      const id = get().selectedRepoId;
      if (id) void get().loadRepoData(id);
    });
    if (get().connected) await get().refreshRepos();
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
