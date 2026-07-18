/**
 * Single subscriber for IPC `dome:ui-action` (agent ui_* tools).
 * ManyPanel mounts several times (sidebar + headless + chat tab) — each registering
 * `window.electron.on` tripped Electron's MaxListenersExceededWarning on ipcRenderer (10).
 */
import { HOME_TAB_ID, useTabStore } from '@/lib/store/useTabStore';
import { useUICursorStore, resolveSelector } from '@/lib/store/useUICursorStore';

/** Shell tabs whose row buttons only render after opening that destination. */
const SHELL_TAB_POINT_OPENERS: Record<string, () => void> = {
  home: () => useTabStore.getState().activateTab(HOME_TAB_ID),
  settings: () => useTabStore.getState().openSettingsTab(),
  calendar: () => useTabStore.getState().openCalendarTab(),
  agents: () => useTabStore.getState().openAgentsTab(),
  learn: () => useTabStore.getState().openLearnTab(),
  flashcards: () => useTabStore.getState().openFlashcardsTab(),
  marketplace: () => useTabStore.getState().openMarketplaceTab(),
  tags: () => useTabStore.getState().openTagsTab(),
  workflows: () => useTabStore.getState().openWorkflowsTab(),
  automations: () => useTabStore.getState().openAutomationsTab(),
  runs: () => useTabStore.getState().openRunsTab(),
  projects: () => useTabStore.getState().openProjectsTab(),
  studio: () => useTabStore.getState().openStudioTab(),
  transcriptions: () => useTabStore.getState().openTranscriptionsTab(),
};

const TAB_ACTIONS: Record<string, () => void> = {
  home: () => useTabStore.getState().activateTab(HOME_TAB_ID),
  settings: () => useTabStore.getState().openSettingsTab(),
  calendar: () => useTabStore.getState().openCalendarTab(),
  agents: () => useTabStore.getState().openAgentsTab(),
  learn: () => useTabStore.getState().openLearnTab(),
  flashcards: () => useTabStore.getState().openFlashcardsTab(),
  marketplace: () => useTabStore.getState().openMarketplaceTab(),
  tags: () => useTabStore.getState().openTagsTab(),
  workflows: () => useTabStore.getState().openWorkflowsTab(),
  automations: () => useTabStore.getState().openAutomationsTab(),
  runs: () => useTabStore.getState().openRunsTab(),
};

let dedupeUiPointTarget: string | null = null;
let dedupeUiPointAt = 0;

const SHELL_TAB_PATTERN = /^tab-([a-z0-9-]+)$/i;
const POINT_DEDUPE_WINDOW_MS = 260;
const SHELL_TAB_DEFER_DELAY_MS = 140;
const CLICK_ELEMENT_DELAY_MS = 400;
const CLICK_HIDE_DELAY_MS = 200;
const NAVIGATE_SHOW_DELAY_MS = 200;
const NAVIGATE_HIDE_DELAY_MS = 1200;
const TYPE_DELAY_MS = 300;
const SCROLL_DEFAULT_AMOUNT = 300;

/**
 * If the target refers to a shell tab whose row is not yet mounted, open that
 * tab and schedule {@link run} on the next frame/timeout. Returns true when the
 * run was scheduled (caller must NOT also invoke run).
 */
function tryOpenShellTabThenRun(target: string, run: () => void): boolean {
  const match = SHELL_TAB_PATTERN.exec(target.trim());
  if (!match) return false;
  const slug = match[1].toLowerCase();
  const opener = SHELL_TAB_POINT_OPENERS[slug];
  if (!opener) return false;
  if (document.querySelector(resolveSelector(target))) return false;
  opener();
  requestAnimationFrame(() => {
    window.setTimeout(run, SHELL_TAB_DEFER_DELAY_MS);
  });
  return true;
}

function recordPointDedupe(target: string) {
  dedupeUiPointTarget = target;
  dedupeUiPointAt = Date.now();
}

function scrollAxis(amount: number, positive: string, negative: string, dir: string): number {
  if (dir === positive) return amount;
  if (dir === negative) return -amount;
  return 0;
}

function handlePointTo(args: Record<string, unknown>, cursor: ReturnType<typeof useUICursorStore.getState>) {
  const target = String(args.target ?? '');
  const tooltip = args.tooltip ? String(args.tooltip) : undefined;
  const now = Date.now();
  if (dedupeUiPointTarget === target && now - dedupeUiPointAt < POINT_DEDUPE_WINDOW_MS) {
    return;
  }

  const applyPoint = () => {
    const sel = resolveSelector(target);
    const btn = document.querySelector(sel) as HTMLElement | null;
    btn?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    recordPointDedupe(target);
    cursor.show(target, tooltip);
  };

  if (tryOpenShellTabThenRun(target, applyPoint)) return;
  applyPoint();
}

function handleHideCursor(_args: Record<string, unknown>, cursor: ReturnType<typeof useUICursorStore.getState>) {
  cursor.hide();
}

function handleNavigate(args: Record<string, unknown>, cursor: ReturnType<typeof useUICursorStore.getState>) {
  const dest = String(args.destination ?? '').toLowerCase();
  const action = TAB_ACTIONS[dest];
  if (!action) return;
  action();
  setTimeout(() => {
    cursor.show(`tab-${dest}`, `→ ${dest}`);
    setTimeout(() => cursor.hide(), NAVIGATE_HIDE_DELAY_MS);
  }, NAVIGATE_SHOW_DELAY_MS);
}

function handleClick(args: Record<string, unknown>, cursor: ReturnType<typeof useUICursorStore.getState>) {
  const target = String(args.target ?? '');
  const selector = resolveSelector(target);

  const runClickSequence = () => {
    cursor.show(target, 'Clicking...');
    window.setTimeout(() => {
      const el = document.querySelector(selector) as HTMLElement | null;
      el?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
      el?.click();
      window.setTimeout(() => cursor.hide(), CLICK_HIDE_DELAY_MS);
    }, CLICK_ELEMENT_DELAY_MS);
  };

  if (tryOpenShellTabThenRun(target, runClickSequence)) return;
  runClickSequence();
}

function typeIntoSelector(selector: string, text: string) {
  const el = document.querySelector(selector) as HTMLInputElement | null;
  if (!el) return;
  el.focus();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) return;
  setter.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function handleType(args: Record<string, unknown>, cursor: ReturnType<typeof useUICursorStore.getState>) {
  const target = String(args.target ?? '');
  const text = String(args.text ?? '');
  const selector = resolveSelector(target);
  cursor.show(target, 'Typing...');
  setTimeout(() => {
    typeIntoSelector(selector, text);
    cursor.hide();
  }, TYPE_DELAY_MS);
}

function handleScroll(args: Record<string, unknown>) {
  const dir = String(args.direction ?? 'down');
  const amount = Number(args.amount ?? SCROLL_DEFAULT_AMOUNT);
  const dx = scrollAxis(amount, 'right', 'left', dir);
  const dy = scrollAxis(amount, 'down', 'up', dir);
  window.scrollBy({ top: dy, left: dx, behavior: 'smooth' });
}

type UiActionHandler = (
  args: Record<string, unknown>,
  cursor: ReturnType<typeof useUICursorStore.getState>,
) => void;

const UI_ACTION_HANDLERS: Record<string, UiActionHandler> = {
  point_to: handlePointTo,
  hide_cursor: handleHideCursor,
  navigate: handleNavigate,
  click: handleClick,
  type: handleType,
  scroll: handleScroll,
};

function handleDomeUiAction(payload: { type: string; args: Record<string, unknown> }) {
  const { type, args } = payload;
  const handler = UI_ACTION_HANDLERS[type];
  if (!handler) return;
  handler(args, useUICursorStore.getState());
}

let removeListener: (() => void) | null = null;

/** Idempotent — safe to call on every shell mount / strict mode replay. */
export function installDomeUiActionBridge(): () => void {
  if (!window.electron?.on) return () => {};
  if (removeListener) return removeListener;

  removeListener = window.electron.on('dome:ui-action', handleDomeUiAction);
  return () => {
    removeListener?.();
    removeListener = null;
  };
}
