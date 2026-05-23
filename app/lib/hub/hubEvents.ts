/** Hub invalidation events — keep sidebar, hero, and list views in sync. */

export const HUB_AGENTS_CHANGED = 'dome:agents-changed';
export const HUB_WORKFLOWS_CHANGED = 'dome:workflows-changed';
export const HUB_AUTOMATIONS_CHANGED = 'dome:automations-changed';
export const HUB_RUNS_CHANGED = 'dome:runs-changed';

/** @deprecated Use HUB_AUTOMATIONS_CHANGED */
export const AUTOMATIONS_CHANGED_EVENT = HUB_AUTOMATIONS_CHANGED;

export const HUB_CHANGED_EVENTS = [
  HUB_AGENTS_CHANGED,
  HUB_WORKFLOWS_CHANGED,
  HUB_AUTOMATIONS_CHANGED,
  HUB_RUNS_CHANGED,
] as const;

function dispatchHubEvent(name: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name));
}

export function notifyHubAgentsChanged() {
  dispatchHubEvent(HUB_AGENTS_CHANGED);
}

export function notifyHubWorkflowsChanged() {
  dispatchHubEvent(HUB_WORKFLOWS_CHANGED);
}

export function notifyHubAutomationsChanged() {
  dispatchHubEvent(HUB_AUTOMATIONS_CHANGED);
}

export function notifyHubRunsChanged() {
  dispatchHubEvent(HUB_RUNS_CHANGED);
}

/** Bridge IPC broadcasts from main process into DOM CustomEvents (once per app load). */
let hubBridgeInstalled = false;

export function installHubEventsBridge() {
  if (hubBridgeInstalled || typeof window === 'undefined') return;
  const electron = window.electron;
  if (!electron?.on) return;
  hubBridgeInstalled = true;
  for (const channel of HUB_CHANGED_EVENTS) {
    electron.on(channel, () => {
      dispatchHubEvent(channel);
    });
  }
}
