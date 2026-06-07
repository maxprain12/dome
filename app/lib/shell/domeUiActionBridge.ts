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

function handleDomeUiAction(payload: { type: string; args: Record<string, unknown> }) {
  const { type, args } = payload;
  const cursor = useUICursorStore.getState();

  switch (type) {
    case 'point_to': {
      const target = String(args.target ?? '');
      const tooltip = args.tooltip ? String(args.tooltip) : undefined;
      const now = Date.now();
      if (dedupeUiPointTarget === target && now - dedupeUiPointAt < 260) {
        break;
      }

      const applyPoint = () => {
        const sel = resolveSelector(target);
        const btn = document.querySelector(sel) as HTMLElement | null;
        btn?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
        dedupeUiPointTarget = target;
        dedupeUiPointAt = Date.now();
        cursor.show(target, tooltip);
      };

      const shellMatch = /^tab-([a-z0-9-]+)$/i.exec(target.trim());
      if (shellMatch) {
        const st = shellMatch[1].toLowerCase();
        const sel = resolveSelector(target);
        const opener = SHELL_TAB_POINT_OPENERS[st];
        if (opener && !document.querySelector(sel)) {
          opener();
          requestAnimationFrame(() => {
            window.setTimeout(applyPoint, 140);
          });
          break;
        }
      }

      applyPoint();
      break;
    }
    case 'hide_cursor':
      cursor.hide();
      break;
    case 'navigate': {
      const dest = String(args.destination ?? '').toLowerCase();
      const action = TAB_ACTIONS[dest];
      if (action) {
        action();
        setTimeout(() => {
          cursor.show(`tab-${dest}`, `→ ${dest}`);
          setTimeout(() => cursor.hide(), 1200);
        }, 200);
      }
      break;
    }
    case 'click': {
      const target = String(args.target ?? '');
      const selector = resolveSelector(target);

      const runClickSequence = () => {
        cursor.show(target, 'Clicking...');
        window.setTimeout(() => {
          const el = document.querySelector(selector) as HTMLElement | null;
          el?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
          el?.click();
          window.setTimeout(() => cursor.hide(), 200);
        }, 400);
      };

      const shellMatch = /^tab-([a-z0-9-]+)$/i.exec(target.trim());
      if (shellMatch) {
        const st = shellMatch[1].toLowerCase();
        const opener = SHELL_TAB_POINT_OPENERS[st];
        if (opener && !document.querySelector(selector)) {
          opener();
          requestAnimationFrame(() => {
            window.setTimeout(runClickSequence, 140);
          });
          break;
        }
      }

      runClickSequence();
      break;
    }
    case 'type': {
      const target = String(args.target ?? '');
      const text = String(args.text ?? '');
      const selector = resolveSelector(target);
      cursor.show(target, 'Typing...');
      setTimeout(() => {
        const el = document.querySelector(selector) as HTMLInputElement | null;
        if (el) {
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) {
            setter.call(el, text);
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        cursor.hide();
      }, 300);
      break;
    }
    case 'scroll': {
      const dir = String(args.direction ?? 'down');
      const amount = Number(args.amount ?? 300);
      const dx = dir === 'right' ? amount : dir === 'left' ? -amount : 0;
      const dy = dir === 'down' ? amount : dir === 'up' ? -amount : 0;
      window.scrollBy({ top: dy, left: dx, behavior: 'smooth' });
      break;
    }
    default:
      break;
  }
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
