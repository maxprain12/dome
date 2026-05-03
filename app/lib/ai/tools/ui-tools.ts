/**
 * UI interaction tools for Many.
 * These tools run entirely in the renderer process — no IPC needed.
 * They read/write DOM directly and control Dome navigation via the tab store.
 *
 * When called through LangGraph they must still be in the renderer tool registry
 * (schema-only for LangGraph), but their execute() functions are what Many uses
 * for direct client-side invocation.
 *
 * NOTE: LangGraph routes tool calls through executeToolInMain, which means these
 * tools need corresponding entries in TOOL_HANDLER_MAP for LangGraph path.
 * For the LangGraph path they are handled by a thin handler that returns
 * { status: 'ui_action_dispatched' } and the real work is done via a renderer
 * event. For simplicity, we also support a direct renderer execution path when
 * Many uses non-LangGraph calls.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readNumberParam } from './common';
import { useUICursorStore, resolveSelector } from '@/lib/store/useUICursorStore';
import { useTabStore } from '@/lib/store/useTabStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findElement(target: string): Element | null {
  const selector = resolveSelector(target);
  return document.querySelector(selector);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export function createUiPointToTool(): AnyAgentTool {
  return {
    label: 'Point to UI Element',
    name: 'ui_point_to',
    description:
      'Move an animated cursor to a specific Dome UI element (`data-ui-target` name or CSS selector). ' +
      'Top-shell tabs use names like tab-home, tab-agents, tab-automations, tab-runs, tab-workflows. ' +
      'Singleton tabs: if that destination is not open yet there is no tab button in the strip—Dome opens it automatically when you point_to that tab-* target. ' +
      'Automations creator: toolbar **automations-hub-new** or empty state **automations-empty-create**. ' +
      'Home sidebar Zap hub: **sidebar-nav-automations-hub**. Tooltip: one short factual line (language of the user). ' +
      'STEP-BY-STEP GUIDANCE: After each short user acknowledgement (vale, ok, ya estoy, listo…), THIS assistant turn MUST ' +
      'include exactly one ui_point_to (or one ui_click) on the NEXT control—not prose-only descriptions. ' +
      'Same turn ALLOWED pairing: optionally call ui_get_elements once FIRST if targets are unclear, then exactly one ui_point_to or ui_click. ' +
      'Never stack multiple highlights (no multiple point_to/click/navigate clicks in one message). ',
    parameters: Type.Object({
      target: Type.String({ description: 'Element target: a data-ui-target name (e.g. "tab-agents") or a CSS selector.' }),
      tooltip: Type.Optional(Type.String({ description: 'Short tooltip to display next to the cursor.' })),
    }),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const target = readStringParam(params, 'target', { required: true });
      const tooltip = readStringParam(params, 'tooltip');
      const el = findElement(target);
      if (!el) {
        return jsonResult({ status: 'not_found', target, message: `Element "${target}" not found in the current view.` });
      }
      useUICursorStore.getState().show(target, tooltip ?? undefined);
      return jsonResult({ status: 'pointing', target, tooltip: tooltip ?? null });
    },
  };
}

export function createUiClickTool(): AnyAgentTool {
  return {
    label: 'Click UI Element',
    name: 'ui_click',
    description:
      'Point to a UI element (shows animated cursor) and then click it after a brief delay. ' +
      'Singleton shell tabs (`tab-agents`, `tab-automations`, …): Dome opens that tab automatically if its button is not mounted yet—same behavior as ui_point_to. ' +
      'Use target names like "tab-agents", "tab-settings", etc., or any CSS selector.',
    parameters: Type.Object({
      target: Type.String({ description: 'Element to click: data-ui-target name or CSS selector.' }),
    }),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const target = readStringParam(params, 'target', { required: true });
      const el = findElement(target);
      if (!el) {
        return jsonResult({ status: 'not_found', target, message: `Element "${target}" not found.` });
      }
      useUICursorStore.getState().show(target, 'Clicking...');
      await sleep(400);
      (el as HTMLElement).click();
      await sleep(200);
      useUICursorStore.getState().hide();
      return jsonResult({ status: 'clicked', target });
    },
  };
}

export function createUiTypeTool(): AnyAgentTool {
  return {
    label: 'Type into UI Element',
    name: 'ui_type',
    description:
      'Focus a text input or textarea and type text into it. Useful for filling search boxes or forms.',
    parameters: Type.Object({
      target: Type.String({ description: 'Input element: data-ui-target name or CSS selector.' }),
      text: Type.String({ description: 'Text to type.' }),
    }),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const target = readStringParam(params, 'target', { required: true });
      const text = readStringParam(params, 'text') ?? '';
      const el = findElement(target) as HTMLInputElement | null;
      if (!el) {
        return jsonResult({ status: 'not_found', target, message: `Element "${target}" not found.` });
      }
      useUICursorStore.getState().show(target, 'Typing...');
      await sleep(300);
      el.focus();
      const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        ?? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeInputSetter) {
        nativeInputSetter.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        (el as HTMLInputElement).value = text;
      }
      useUICursorStore.getState().hide();
      return jsonResult({ status: 'typed', target, text });
    },
  };
}

export function createUiScrollTool(): AnyAgentTool {
  return {
    label: 'Scroll',
    name: 'ui_scroll',
    description: 'Scroll the page or a scrollable element up or down by a given amount in pixels.',
    parameters: Type.Object({
      direction: Type.Union([Type.Literal('up'), Type.Literal('down'), Type.Literal('left'), Type.Literal('right')], {
        description: 'Scroll direction.',
      }),
      amount: Type.Optional(Type.Number({ description: 'Pixels to scroll. Default: 300.' })),
      target: Type.Optional(Type.String({ description: 'Scrollable element. Defaults to the main window.' })),
    }),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const direction = readStringParam(params, 'direction') ?? 'down';
      const amount = readNumberParam(params, 'amount') ?? 300;
      const target = readStringParam(params, 'target');
      const scrollable = target ? (findElement(target) ?? window) : window;
      const dx = direction === 'right' ? amount : direction === 'left' ? -amount : 0;
      const dy = direction === 'down' ? amount : direction === 'up' ? -amount : 0;
      (scrollable as Element | Window).scrollBy({ top: dy, left: dx, behavior: 'smooth' });
      return jsonResult({ status: 'scrolled', direction, amount });
    },
  };
}

const NAV_MAP: Record<string, () => void> = {
  home: () => useTabStore.getState().activateTab('home'),
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

export function createUiNavigateTool(): AnyAgentTool {
  return {
    label: 'Navigate to Tab',
    name: 'ui_navigate',
    description:
      'Open or switch to a named Dome tab. ' +
      'Valid destinations: home, settings, calendar, agents, learn, flashcards, marketplace, tags, workflows, automations, runs.',
    parameters: Type.Object({
      destination: Type.String({ description: 'Tab to open (e.g. "agents", "settings", "calendar").' }),
    }),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const dest = (readStringParam(params, 'destination') ?? '').toLowerCase().trim();
      const action = NAV_MAP[dest];
      if (!action) {
        const valid = Object.keys(NAV_MAP).join(', ');
        return jsonResult({ status: 'unknown_destination', destination: dest, valid_destinations: valid });
      }
      action();
      // Show cursor on the newly-active tab after navigation
      await sleep(200);
      useUICursorStore.getState().show(`tab-${dest}`, `→ ${dest}`);
      await sleep(1200);
      useUICursorStore.getState().hide();
      return jsonResult({ status: 'navigated', destination: dest });
    },
  };
}

export function createUiGetElementsTool(): AnyAgentTool {
  return {
    label: 'Get UI Elements',
    name: 'ui_get_elements',
    description:
      'List elements with attribute data-ui-target in the DOM. Use BEFORE ui_point_to when you are unsure ' +
      '(e.g. after the user confirms a navigation step during a guided tour). Then pick one target from results.',
    parameters: Type.Object({}),
    execute: async () => {
      const els = document.querySelectorAll('[data-ui-target]');
      const elements = Array.from(els).map((el) => ({
        target: el.getAttribute('data-ui-target'),
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? '').trim().slice(0, 60),
        visible: el.getBoundingClientRect().width > 0,
      }));
      return jsonResult({ status: 'success', count: elements.length, elements });
    },
  };
}

export function createUiHideCursorTool(): AnyAgentTool {
  return {
    label: 'Hide Cursor',
    name: 'ui_hide_cursor',
    description: 'Hide the animated UI cursor overlay.',
    parameters: Type.Object({}),
    execute: async () => {
      useUICursorStore.getState().hide();
      return jsonResult({ status: 'hidden' });
    },
  };
}

export function createUiTools(): AnyAgentTool[] {
  return [
    createUiPointToTool(),
    createUiClickTool(),
    createUiTypeTool(),
    createUiScrollTool(),
    createUiNavigateTool(),
    createUiGetElementsTool(),
    createUiHideCursorTool(),
  ];
}
