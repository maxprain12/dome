import { create } from 'zustand';

// Sort keys shared by the Kanban and Minimal tracker views so the selection
// persists across tab switches, modal open/close and app restarts.
export type MilestoneSort = 'due_date' | 'newest' | 'oldest' | 'state';
export type IssueSort = 'newest' | 'oldest' | 'status';

const STORAGE_KEY = 'dome:github:sort';

interface PersistedSort {
  milestones: MilestoneSort;
  issues: IssueSort;
}

function load(): PersistedSort {
  if (typeof localStorage === 'undefined') return { milestones: 'due_date', issues: 'newest' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedSort>;
      return {
        milestones: parsed.milestones ?? 'due_date',
        issues: parsed.issues ?? 'newest',
      };
    }
  } catch {
    /* ignore */
  }
  return { milestones: 'due_date', issues: 'newest' };
}

function save(state: PersistedSort) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

interface GitHubSortState extends PersistedSort {
  setMilestoneSort: (s: MilestoneSort) => void;
  setIssueSort: (s: IssueSort) => void;
}

const initial = load();

export const useGitHubSortStore = create<GitHubSortState>((set) => ({
  milestones: initial.milestones,
  issues: initial.issues,
  setMilestoneSort: (milestones) => {
    set({ milestones });
    save({ ...useGitHubSortStore.getState(), milestones });
  },
  setIssueSort: (issues) => {
    set({ issues });
    save({ ...useGitHubSortStore.getState(), issues });
  },
}));