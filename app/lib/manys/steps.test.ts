import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { request } from './api';
import { useLiveRuns, applyEvent, type LiveRuns } from './liveRuns';
import { stepDetail, stepKey, stepsOf, useManySteps } from './steps';

vi.mock('./api', () => ({ request: vi.fn() }));

const step = (sequence: number, task: string, tool: string, phase: 'start' | 'end', ok: boolean | null = null) => ({
  sequence, kind: 'task_step', task_id: task, many_id: 'm1', data: { callId: `${task}-${sequence}`, tool, operation: null, host: null, phase, ok },
});

describe('stepsOf', () => {
  it('lists the tool calls of one Many across its turns, oldest first, capped', () => {
    let runs: LiveRuns = {};
    runs = applyEvent(runs, step(1, 'a', 'vault_search', 'start'), 1);
    runs = applyEvent(runs, { ...step(2, 'b', 'web_research', 'start'), many_id: 'other' }, 2);
    for (let i = 0; i < 20; i += 1) runs = applyEvent(runs, step(10 + i, 'c', 'vault_read', 'start'), 3 + i);
    const steps = stepsOf(runs, 'm1');
    expect(steps).toHaveLength(12);
    expect(steps.every((item) => item.tool === 'vault_read')).toBe(true);
    expect(stepsOf(runs, 'other')).toEqual([{ id: 'b-2', tool: 'web_research', operation: null, host: null, done: false, ok: null }]);
  });
});

describe('step labels', () => {
  it('maps known tools and falls back for new ones', () => {
    expect(stepKey('computer_read')).toBe('lookComputer');
    expect(stepKey('web_research')).toBe('webResearch');
    expect(stepKey('something_new')).toBe('generic');
  });

  it('never shows an MCP server, only the tool', () => {
    expect(stepDetail({ tool: 'mcp_call', operation: 'srv-123/list_issues' })).toBe('list_issues');
    expect(stepDetail({ tool: 'skill_read', operation: 'Weekly report' })).toBe('Weekly report');
    expect(stepDetail({ tool: 'vault_read', operation: null })).toBe('');
  });
});

describe('useManySteps', () => {
  beforeEach(() => { vi.mocked(request).mockReset(); useLiveRuns.getState().reset(); });

  it('reads the recent history once and then follows the live feed', async () => {
    vi.mocked(request).mockResolvedValue({ steps: [
      { sequence: 1, task_id: 'old', data: { callId: 'c1', tool: 'vault_search', operation: null, host: null, phase: 'start', ok: null } },
      { sequence: 2, task_id: 'old', data: { callId: 'c1', tool: 'vault_search', operation: null, host: null, phase: 'end', ok: true } },
    ] });
    const { result } = renderHook(() => useManySteps('m1'));
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toMatchObject({ tool: 'vault_search', done: true, ok: true });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/m1/steps');
    useLiveRuns.getState().apply(step(50, 'new', 'web_research', 'start'));
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current[1]).toMatchObject({ tool: 'web_research', done: false });
  });

  it('does not close a task the server says is still running', async () => {
    vi.mocked(request).mockResolvedValue({ steps: [{ sequence: 1, task_id: 'busy', data: { callId: 'c', tool: 'computer_read', operation: null, host: null, phase: 'start', ok: null } }] });
    const { result } = renderHook(() => useManySteps('m1', ['busy']));
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].done).toBe(false);
  });

  it('survives an unreachable steps endpoint', async () => {
    vi.mocked(request).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useManySteps('m1'));
    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});
