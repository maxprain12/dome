import { useEffect, useRef } from 'react';
import { create } from 'zustand';

/** One event of the feed, as the main process relays it. */
export interface ManyEvent {
  sequence: number;
  kind: string;
  task_id: string | null;
  many_id: string | null;
  data: Record<string, unknown>;
}

/** What a turn looks like while it happens, in the order it happened. */
export type LiveItem =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'tool'; callId: string; tool: string; operation: string | null; host: string | null; done: boolean; ok: boolean | null };

export interface LiveRun {
  taskId: string;
  manyId: string | null;
  items: LiveItem[];
  /** The task stopped, waited or finished: its text is now a saved message, its tool calls remain. */
  ended: boolean;
  touched: number;
}
export type LiveRuns = Record<string, LiveRun>;

/** Ends of a run. `task_queued` is the only task event that starts one. */
const ENDED = new Set(['task_completed', 'task_failed', 'task_paused', 'task_waiting_input', 'task_cancelled']);
const MAX_RUNS = 40;
const MAX_ITEMS = 120;

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function runFor(runs: LiveRuns, event: ManyEvent, now: number): LiveRun {
  const taskId = event.task_id as string;
  const existing = runs[taskId];
  if (existing) return existing;
  return { taskId, manyId: event.many_id, items: [], ended: false, touched: now };
}

function trim(runs: LiveRuns): LiveRuns {
  const ids = Object.keys(runs);
  if (ids.length <= MAX_RUNS) return runs;
  const keep = new Set(ids.sort((a, b) => runs[b].touched - runs[a].touched).slice(0, MAX_RUNS));
  return Object.fromEntries(Object.entries(runs).filter(([id]) => keep.has(id)));
}

/** Pure: the runs after one more event. Unknown or malformed events change nothing. */
export function applyEvent(runs: LiveRuns, event: ManyEvent, now = Date.now()): LiveRuns {
  if (!event.task_id) return runs;
  const data = event.data ?? {};
  if (event.kind === 'task_queued') {
    const fresh: LiveRun = { taskId: event.task_id, manyId: event.many_id, items: [], ended: false, touched: now };
    return trim({ ...runs, [event.task_id]: fresh });
  }
  if (event.kind === 'run_text') {
    const messageId = text(data.messageId);
    const chunk = text(data.text);
    if (!messageId || chunk === null) return runs;
    const run = runFor(runs, event, now);
    if (run.ended) return runs;
    const index = run.items.findIndex((item) => item.kind === 'text' && item.id === messageId);
    const items = [...run.items];
    if (index >= 0) {
      const current = items[index] as Extract<LiveItem, { kind: 'text' }>;
      items[index] = { ...current, text: current.text + chunk };
    } else if (chunk) items.push({ kind: 'text', id: messageId, text: chunk });
    return trim({ ...runs, [event.task_id]: { ...run, items: items.slice(-MAX_ITEMS), touched: now } });
  }
  if (event.kind === 'task_step') {
    const tool = text(data.tool);
    const phase = data.phase;
    if (!tool || (phase !== 'start' && phase !== 'end')) return runs;
    const callId = text(data.callId) ?? `${event.sequence}`;
    const run = runFor(runs, event, now);
    const items = [...run.items];
    const index = items.findIndex((item) => item.kind === 'tool' && (item.callId === callId || (!text(data.callId) && !item.done && item.tool === tool)));
    const operation = text(data.operation);
    const host = text(data.host);
    if (phase === 'start') {
      if (index >= 0) return runs;
      items.push({ kind: 'tool', callId, tool, operation, host, done: false, ok: null });
    } else if (index >= 0) {
      const current = items[index] as Extract<LiveItem, { kind: 'tool' }>;
      items[index] = { ...current, done: true, ok: data.ok === true };
    } else items.push({ kind: 'tool', callId, tool, operation, host, done: true, ok: data.ok === true });
    return trim({ ...runs, [event.task_id]: { ...run, items: items.slice(-MAX_ITEMS), touched: now } });
  }
  if (ENDED.has(event.kind)) {
    const run = runFor(runs, event, now);
    const items = run.items.filter((item) => item.kind === 'tool').map((item) => (item.kind === 'tool' && !item.done ? { ...item, done: true, ok: false } : item));
    return trim({ ...runs, [event.task_id]: { ...run, items, ended: true, touched: now } });
  }
  return runs;
}

interface StepRow { sequence: number; task_id: string | null; data: Record<string, unknown> }

interface LiveState {
  runs: LiveRuns;
  lastSequence: number;
  apply: (event: ManyEvent) => void;
  /** Recent history from the steps endpoint, for turns that finished before this window looked. Tasks still in flight stay open. */
  hydrate: (rows: StepRow[], manyId: string, inFlight: string[]) => void;
  reset: () => void;
}

export const useLiveRuns = create<LiveState>((set) => ({
  runs: {},
  lastSequence: 0,
  apply: (event) => set((state) => {
    if (event.sequence <= state.lastSequence) return state;
    return { runs: applyEvent(state.runs, event), lastSequence: event.sequence };
  }),
  hydrate: (rows, manyId, inFlight) => set((state) => {
    const byTask = new Map<string, StepRow[]>();
    for (const row of rows) {
      if (row.task_id && !state.runs[row.task_id]) byTask.set(row.task_id, [...(byTask.get(row.task_id) ?? []), row]);
    }
    if (byTask.size === 0) return state;
    let runs = state.runs;
    for (const [taskId, steps] of byTask) {
      // A task this window never saw start is over by the time it is read back, unless the server says it still runs.
      for (const step of steps) runs = applyEvent(runs, { sequence: step.sequence, kind: 'task_step', task_id: taskId, many_id: manyId, data: step.data }, 0);
      if (runs[taskId] && !inFlight.includes(taskId)) runs = applyEvent(runs, { sequence: 0, kind: 'task_paused', task_id: taskId, many_id: manyId, data: {} }, 0);
    }
    return { runs };
  }),
  reset: () => set({ runs: {}, lastSequence: 0 }),
}));

type Bridge = { invoke: (channel: string, ...args: unknown[]) => Promise<unknown>; on: (channel: string, callback: (event: ManyEvent) => void) => () => void };

/** Subscribes this window to the live feed while it is mounted. `onEvent` runs for every event. */
export function useManyEvents(onEvent?: (event: ManyEvent) => void): void {
  const callback = useRef(onEvent);
  callback.current = onEvent;
  useEffect(() => {
    const bridge = (window as { electron?: Bridge }).electron;
    if (!bridge) return undefined;
    const unsubscribe = bridge.on('manys:events:event', (event: ManyEvent) => {
      useLiveRuns.getState().apply(event);
      callback.current?.(event);
    });
    void bridge.invoke('manys:events:subscribe');
    return () => {
      unsubscribe();
      void bridge.invoke('manys:events:unsubscribe');
    };
  }, []);
}
