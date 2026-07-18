import { create } from 'zustand';

const TTL_MS = 5000;

export type OpenIntent =
  | { kind: 'github-issue'; issueId: string; repoId?: string; at: number }
  | {
      kind: 'email';
      sourceId: string;
      accountId?: string;
      folder?: string;
      uid?: string | number;
      at: number;
    }
  | { kind: 'social-post'; postId: string; at: number };

interface OpenIntentState {
  intent: OpenIntent | null;
  setIntent: (intent: OpenIntent) => void;
  consume: <K extends OpenIntent['kind']>(kind: K) => Extract<OpenIntent, { kind: K }> | null;
}

function isFresh(intent: OpenIntent | null): intent is OpenIntent {
  return intent != null && Date.now() - intent.at <= TTL_MS;
}

export const useOpenIntentStore = create<OpenIntentState>((set, get) => ({
  intent: null,
  setIntent: (intent) => {
    set({ intent });
  },
  consume: (kind) => {
    const cur = get().intent;
    if (!isFresh(cur) || cur.kind !== kind) {
      if (cur && !isFresh(cur)) set({ intent: null });
      return null;
    }
    set({ intent: null });
    return cur as Extract<OpenIntent, { kind: typeof kind }>;
  },
}));

export function focusGithubIssue(detail: { issueId: string; repoId?: string }): void {
  useOpenIntentStore.getState().setIntent({
    kind: 'github-issue',
    issueId: detail.issueId,
    ...(detail.repoId ? { repoId: detail.repoId } : {}),
    at: Date.now(),
  });
  window.dispatchEvent(new CustomEvent('dome:focus-github-issue', { detail }));
}

export function focusEmail(detail: {
  sourceId: string;
  accountId?: string;
  folder?: string;
  uid?: string | number;
}): void {
  useOpenIntentStore.getState().setIntent({
    kind: 'email',
    sourceId: detail.sourceId,
    ...(detail.accountId ? { accountId: detail.accountId } : {}),
    ...(detail.folder ? { folder: detail.folder } : {}),
    ...(detail.uid != null ? { uid: detail.uid } : {}),
    at: Date.now(),
  });
  window.dispatchEvent(new CustomEvent('dome:focus-email', { detail }));
}

export function focusSocialPost(detail: { postId: string }): void {
  useOpenIntentStore.getState().setIntent({
    kind: 'social-post',
    postId: detail.postId,
    at: Date.now(),
  });
  window.dispatchEvent(new CustomEvent('dome:focus-social-post', { detail }));
}
