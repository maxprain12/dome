/**
 * Typed renderer event bus. All `dome:*` CustomEvents used for open-intents
 * and store-adjacent notifications should be declared here.
 */

export const DOME_EVENTS = {
  focusGithubIssue: 'dome:focus-github-issue',
  focusEmail: 'dome:focus-email',
  focusSocialPost: 'dome:focus-social-post',
  focusPerson: 'dome:focus-person',
  manySidebarOpen: 'dome:many-sidebar-open',
  agentsChanged: 'dome:agents-changed',
  workflowsChanged: 'dome:workflows-changed',
  resourcesChanged: 'dome:resources-changed',
  resourceRelationsChanged: 'dome:resource-relations-changed',
  layoutReset: 'dome:layout-reset',
  aiVisibleModelsChanged: 'dome:ai-visible-models-changed',
  contextualFired: 'dome:contextual-fired',
} as const;

export type DomeEventName = (typeof DOME_EVENTS)[keyof typeof DOME_EVENTS];

export type DomeEventPayloads = {
  'dome:focus-github-issue': { issueId: string; repoId?: string };
  'dome:focus-email': {
    sourceId: string;
    accountId?: string;
    folder?: string;
    uid?: string | number;
  };
  'dome:focus-social-post': { postId: string };
  'dome:focus-person': { personId: string };
  'dome:many-sidebar-open': undefined;
  'dome:agents-changed': undefined;
  'dome:workflows-changed': undefined;
  'dome:resources-changed': undefined;
  'dome:resource-relations-changed': { resourceId?: string };
  'dome:layout-reset': undefined;
  'dome:ai-visible-models-changed': undefined;
  'dome:contextual-fired': { tag: string; fired: number };
};

export function dispatchDomeEvent<K extends keyof DomeEventPayloads>(
  name: K,
  detail?: DomeEventPayloads[K],
): void {
  const target = globalThis.window;
  if (!target) return;
  target.dispatchEvent(new CustomEvent(name, detail === undefined ? undefined : { detail }));
}

export function onDomeEvent<K extends keyof DomeEventPayloads>(
  name: K,
  handler: (detail: DomeEventPayloads[K]) => void,
): () => void {
  const target = globalThis.window;
  if (!target) return () => undefined;
  const listener = (event: Event) => {
    handler((event as CustomEvent<DomeEventPayloads[K]>).detail);
  };
  target.addEventListener(name, listener);
  return () => target.removeEventListener(name, listener);
}
