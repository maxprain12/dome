import { beforeEach, describe, expect, it } from 'vitest';
import { applyEvent, useLiveRuns, type LiveRuns, type ManyEvent } from './liveRuns';

let sequence = 0;
const event = (kind: string, data: Record<string, unknown> = {}, task = 't1'): ManyEvent => ({ sequence: ++sequence, kind, task_id: task, many_id: 'm1', data });
const play = (...events: ManyEvent[]): LiveRuns => events.reduce((runs, next) => applyEvent(runs, next, 1), {} as LiveRuns);

describe('applyEvent', () => {
  it('builds a turn in the order it happened: text, tool, more text', () => {
    const runs = play(
      event('task_queued'),
      event('run_text', { messageId: 'a', text: 'Let me ', end: false }),
      event('run_text', { messageId: 'a', text: 'check.', end: true }),
      event('task_step', { callId: 'c1', tool: 'web_research', operation: 'search', host: null, phase: 'start', ok: null }),
      event('task_step', { callId: 'c1', tool: 'web_research', operation: 'search', host: null, phase: 'end', ok: true }),
      event('run_text', { messageId: 'b', text: 'Found it.', end: false }),
    );
    expect(runs.t1.items).toEqual([
      { kind: 'text', id: 'a', text: 'Let me check.' },
      { kind: 'tool', callId: 'c1', tool: 'web_research', operation: 'search', host: null, done: true, ok: true },
      { kind: 'text', id: 'b', text: 'Found it.' },
    ]);
    expect(runs.t1.ended).toBe(false);
  });

  it('pairs a tool end with its own call even when two of the same tool overlap', () => {
    const runs = play(
      event('task_step', { callId: 'x', tool: 'vault_read', phase: 'start' }),
      event('task_step', { callId: 'y', tool: 'vault_read', phase: 'start' }),
      event('task_step', { callId: 'x', tool: 'vault_read', phase: 'end', ok: false }),
    );
    const tools = runs.t1.items.filter((item) => item.kind === 'tool');
    expect(tools.map((item) => item.kind === 'tool' && [item.callId, item.done, item.ok])).toEqual([['x', true, false], ['y', false, null]]);
  });

  it('keeps tool calls but drops the live text when the task ends, and fails calls left open', () => {
    const runs = play(
      event('run_text', { messageId: 'a', text: 'draft', end: false }),
      event('task_step', { callId: 'c', tool: 'computer_read', phase: 'start' }),
      event('task_completed', { text: 'done' }),
    );
    expect(runs.t1.ended).toBe(true);
    expect(runs.t1.items).toEqual([{ kind: 'tool', callId: 'c', tool: 'computer_read', operation: null, host: null, done: true, ok: false }]);
    expect(applyEvent(runs, event('run_text', { messageId: 'z', text: 'late', end: false }), 2).t1.items).toHaveLength(1);
  });

  it('starts a new run on queue and ignores events without a task or with bad data', () => {
    const before = play(event('run_text', { messageId: 'a', text: 'old', end: false }));
    expect(applyEvent(before, event('task_queued'), 1).t1.items).toEqual([]);
    expect(applyEvent(before, { ...event('run_text', { messageId: 'a', text: 'x' }), task_id: null }, 1)).toBe(before);
    expect(applyEvent(before, event('run_text', { text: 'no id' }), 1)).toBe(before);
    expect(applyEvent(before, event('task_step', { tool: 'x', phase: 'sideways' }), 1)).toBe(before);
    expect(applyEvent(before, event('grants_changed'), 1)).toBe(before);
  });

  it('keeps only the most recent runs', () => {
    let runs: LiveRuns = {};
    for (let i = 0; i < 50; i += 1) runs = applyEvent(runs, event('task_queued', {}, `task-${i}`), i);
    expect(Object.keys(runs)).toHaveLength(40);
    expect(runs['task-49']).toBeDefined();
    expect(runs['task-0']).toBeUndefined();
  });
});

describe('live store', () => {
  beforeEach(() => { useLiveRuns.getState().reset(); });

  it('ignores a replayed sequence', () => {
    const first = event('run_text', { messageId: 'a', text: 'hi', end: false });
    useLiveRuns.getState().apply(first);
    useLiveRuns.getState().apply(first);
    expect(useLiveRuns.getState().runs.t1.items).toEqual([{ kind: 'text', id: 'a', text: 'hi' }]);
  });

  it('shows finished turns from the recent steps without overriding a live one', () => {
    useLiveRuns.getState().apply(event('task_queued', {}, 'live'));
    useLiveRuns.getState().hydrate([
      { sequence: 1, task_id: 'old', data: { callId: 'c', tool: 'web_research', phase: 'start' } },
      { sequence: 2, task_id: 'old', data: { callId: 'c', tool: 'web_research', phase: 'end', ok: true } },
      { sequence: 3, task_id: 'live', data: { callId: 'd', tool: 'vault_search', phase: 'start' } },
    ], 'm1', []);
    const { runs } = useLiveRuns.getState();
    expect(runs.old.ended).toBe(true);
    expect(runs.old.items).toHaveLength(1);
    expect(runs.live.ended).toBe(false);
    expect(runs.live.items).toEqual([]);
  });

  it('keeps a task open that the server still reports as running', () => {
    useLiveRuns.getState().hydrate([{ sequence: 1, task_id: 'busy', data: { callId: 'c', tool: 'web_research', phase: 'start' } }], 'm1', ['busy']);
    const run = useLiveRuns.getState().runs.busy;
    expect(run.ended).toBe(false);
    useLiveRuns.getState().apply(event('run_text', { messageId: 'a', text: 'still going', end: false }, 'busy'));
    expect(useLiveRuns.getState().runs.busy.items.at(-1)).toEqual({ kind: 'text', id: 'a', text: 'still going' });
  });
});
