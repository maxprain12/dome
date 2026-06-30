import { create } from 'zustand';
import { githubClient } from '@/lib/github/client';

type SyncStatus = 'idle' | 'syncing' | 'error';

let _unsubSyncStatus: (() => void) | null = null;
let _unsubDataUpdated: (() => void) | null = null;
let _subscribed = false;
let _refreshDebounce: ReturnType<typeof setTimeout> | null = null;
const REFRESH_DEBOUNCE_MS = 500;
const ISSUES_PAGE_SIZE = 5000;

let _loadRepoInflight: { repoId: string; promise: Promise<void> } | null = null;
let _activeProjectId = 'default';

async function fetchAllIssues(repoId: string, projectId: string): Promise<GitHubIssueRow[]> {
  const all: GitHubIssueRow[] = [];
  let offset = 0;
  for (;;) {
    const res = await githubClient.issues.list(repoId, { limit: ISSUES_PAGE_SIZE, offset, projectId });
    if (!res.success) throw new Error(res.error ?? 'Failed to load issues');
    all.push(...(res.issues ?? []));
    if (!res.truncated) break;
    offset += res.limit ?? ISSUES_PAGE_SIZE;
  }
  return all;
}

interface GitHubState {
  connected: boolean;
  login: string | null;
  checkingAuth: boolean;
  projectId: string;

  repos: GitHubRepoRow[];
  catalog: GitHubCatalogRepoRow[];
  assignments: Record<string, string[]>;
  selectedRepoId: string | null;

  milestones: GitHubMilestoneRow[];
  issues: GitHubIssueRow[];
  branches: GitHubBranchRow[];
  releases: GitHubReleaseRow[];

  syncStatus: SyncStatus;
  lastSync: number | null;
  loading: boolean;
  error: string | null;

  init: (projectId: string) => Promise<void>;
  dispose: () => void;
  refreshStatus: () => Promise<void>;
  refreshRepos: (projectId?: string) => Promise<void>;
  refreshCatalog: (projectId?: string) => Promise<void>;
  selectRepo: (repoId: string) => Promise<void>;
  toggleRepoSelected: (
    payload: { repoId?: string; remote?: GitHubCatalogRepoRow; selected: boolean },
    projectId?: string,
  ) => Promise<void>;
  loadRepoData: (repoId: string, projectId?: string) => Promise<void>;
  patchLocalIssue: (issue: GitHubIssueRow) => void;
  syncNow: (projectId?: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

function resetRepoData(set: (partial: Partial<GitHubState>) => void) {
  set({
    selectedRepoId: null,
    milestones: [],
    issues: [],
    branches: [],
    releases: [],
  });
}

export const useGitHubStore = create<GitHubState>((set, get) => ({
  connected: false,
  login: null,
  checkingAuth: true,
  projectId: 'default',
  repos: [],
  catalog: [],
  assignments: {},
  selectedRepoId: null,
  milestones: [],
  issues: [],
  branches: [],
  releases: [],
  syncStatus: 'idle',
  lastSync: null,
  loading: false,
  error: null,

  init: async (projectId) => {
    const pid = projectId.trim() || 'default';
    if (_activeProjectId !== pid) {
      _activeProjectId = pid;
      resetRepoData(set);
      set({ projectId: pid, repos: [], catalog: [], assignments: {} });
    } else {
      set({ projectId: pid });
    }

    await get().refreshStatus();

    if (!_subscribed) {
      _subscribed = true;
      _unsubSyncStatus = githubClient.onSyncStatus((d) => {
        const status = (d.status as SyncStatus) || 'idle';
        // Background mutation sync is silent in main — never show a global spinner for it.
        if (status === 'syncing') return;
        set({
          syncStatus: status,
          lastSync: d.lastSync ?? get().lastSync,
          error: d.error ?? null,
        });
      });
      _unsubDataUpdated = githubClient.onDataUpdated((payload) => {
        const refresh = () => {
          set({ syncStatus: 'idle' });
          void get().refreshRepos();
          const id = get().selectedRepoId;
          if (id) void get().loadRepoData(id);
        };
        if (payload?.local === true) {
          if (_refreshDebounce) {
            clearTimeout(_refreshDebounce);
            _refreshDebounce = null;
          }
          refresh();
          return;
        }
        if (_refreshDebounce) clearTimeout(_refreshDebounce);
        _refreshDebounce = setTimeout(() => {
          _refreshDebounce = null;
          refresh();
        }, REFRESH_DEBOUNCE_MS);
      });
    }

    if (get().connected) await get().refreshRepos(pid);
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

  refreshRepos: async (projectId) => {
    const pid = projectId?.trim() || get().projectId || 'default';
    const res = await githubClient.repos.list(pid);
    if (res.success && res.repos) {
      set({ repos: res.repos, projectId: pid });
      const selectedId = get().selectedRepoId;
      const firstSelected = res.repos.find((r) => r.selected === 1) ?? null;
      if (!selectedId || !res.repos.some((r) => r.id === selectedId)) {
        if (firstSelected) void get().selectRepo(firstSelected.id);
        else resetRepoData(set);
      }
    }
  },

  refreshCatalog: async (projectId) => {
    const pid = projectId?.trim() || get().projectId || 'default';
    const res = await githubClient.repos.refresh(pid);
    if (res.success) {
      set({
        catalog: res.catalog ?? [],
        repos: res.tracked ?? get().repos,
        assignments: res.assignments ?? {},
        projectId: pid,
      });
    }
  },

  selectRepo: async (repoId) => {
    set({ selectedRepoId: repoId });
    await get().loadRepoData(repoId);
  },

  toggleRepoSelected: async ({ repoId, remote, selected }, projectId) => {
    const pid = projectId?.trim() || get().projectId || 'default';
    set({ error: null });
    const res = await githubClient.repos.setSelected({
      projectId: pid,
      selected,
      repoId,
      remote,
    });
    if (!res.success) {
      set({ error: res.error ?? 'Failed to update repo selection' });
      return;
    }
    await get().refreshRepos(pid);
    if (selected && res.repo) {
      await get().selectRepo(res.repo.id);
    }
  },

  loadRepoData: async (repoId, projectId) => {
    if (_loadRepoInflight?.repoId === repoId) {
      await _loadRepoInflight.promise;
      return;
    }

    const pid = projectId?.trim() || get().projectId || 'default';

    const run = (async () => {
      set({ loading: true, error: null });
      try {
        const ms = await githubClient.milestones.list(repoId, pid);
        if (!ms.success) throw new Error(ms.error ?? 'Failed to load milestones');

        const issues = await fetchAllIssues(repoId, pid);

        const br = await githubClient.branches.list(repoId, pid);
        if (!br.success) throw new Error(br.error ?? 'Failed to load branches');

        const rel = await githubClient.releases.list(repoId, pid);
        if (!rel.success) throw new Error(rel.error ?? 'Failed to load releases');

        set({
          milestones: ms.milestones ?? [],
          issues,
          branches: br.branches ?? [],
          releases: rel.releases ?? [],
          loading: false,
        });
      } catch (e) {
        set({ loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();

    _loadRepoInflight = { repoId, promise: run };
    try {
      await run;
    } finally {
      if (_loadRepoInflight?.repoId === repoId) _loadRepoInflight = null;
    }
  },

  patchLocalIssue: (issue) => {
    set((state) => ({
      syncStatus: 'idle',
      issues: state.issues.map((row) => (row.id === issue.id ? { ...row, ...issue } : row)),
    }));
  },

  syncNow: async (projectId?: string) => {
    const pid = projectId?.trim() || get().projectId || 'default';
    const res = await githubClient.syncNow(pid);
    if (res.success) {
      set({ syncStatus: 'idle', lastSync: Date.now(), error: null });
    } else if (res.error === 'Sync already in progress') {
      // Background sync from a mutation is already running — not an error.
      set({ syncStatus: 'idle', error: null });
    } else {
      set({ syncStatus: 'error', error: res.error ?? 'Sync failed' });
    }
  },

  disconnect: async () => {
    await githubClient.auth.disconnect();
    set({
      connected: false,
      login: null,
      repos: [],
      catalog: [],
      assignments: {},
      selectedRepoId: null,
      milestones: [],
      issues: [],
      branches: [],
      releases: [],
    });
  },
}));
