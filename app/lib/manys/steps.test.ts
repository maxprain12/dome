import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { request } from './api';
import { foldSteps, stepDetail, stepKey, useManySteps, type ManyStepRow } from './steps';

vi.mock('./api', () => ({ request: vi.fn() }));

const row = (sequence: number, tool: string, phase: 'start' | 'end', ok: boolean | null = null, operation: string | null = null): ManyStepRow => ({
  sequence, task_id: 't', data: { tool, operation, host: null, phase, ok },
});

describe('foldSteps', () => {
  it('joins a start and its end into one step', () => {
    const steps = foldSteps([], [row(1, 'vault_search', 'start'), row(2, 'vault_search', 'end', true)]);
    expect(steps).toEqual([{ id: '1', tool: 'vault_search', operation: null, host: null, done: true, ok: true }]);
  });

  it('keeps a call open until its end arrives and marks failures', () => {
    const open = foldSteps([], [row(1, 'computer_read', 'start')]);
    expect(open[0].done).toBe(false);
    const closed = foldSteps(open, [row(2, 'computer_read', 'end', false)]);
    expect(closed[0]).toMatchObject({ done: true, ok: false });
  });

  it('keeps an end whose start was missed and caps the list', () => {
    expect(foldSteps([], [row(5, 'mcp_call', 'end', true)])).toHaveLength(1);
    const many = foldSteps([], Array.from({ length: 30 }, (_, i) => row(i + 1, 'vault_read', 'start')));
    expect(many).toHaveLength(12);
    expect(many.at(-1)?.id).toBe('30');
  });
});

describe('step labels', () => {
  it('maps known tools and falls back for new ones', () => {
    expect(stepKey('computer_read')).toBe('lookComputer');
    expect(stepKey('something_new')).toBe('generic');
  });

  it('never shows an MCP server, only the tool', () => {
    expect(stepDetail({ tool: 'mcp_call', operation: 'srv-123/list_issues' })).toBe('list_issues');
    expect(stepDetail({ tool: 'skill_read', operation: 'Weekly report' })).toBe('Weekly report');
    expect(stepDetail({ tool: 'vault_read', operation: null })).toBe('');
  });
});

describe('useManySteps', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.mocked(request).mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it('loads the latest steps, then only what is new, and stops when idle', async () => {
    vi.mocked(request)
      .mockResolvedValueOnce({ steps: [row(1, 'vault_search', 'start')] })
      .mockResolvedValue({ steps: [row(2, 'vault_search', 'end', true)] });
    const { result, rerender } = renderHook(({ active }) => useManySteps('many-a', active), { initialProps: { active: true } });
    await act(async () => { await Promise.resolve(); });
    expect(request).toHaveBeenCalledWith('/many-a/steps');
    expect(result.current[0].done).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(request).toHaveBeenLastCalledWith('/many-a/steps?after=1');
    expect(result.current[0]).toMatchObject({ done: true, ok: true });
    rerender({ active: false });
    expect(result.current).toEqual([]);
    const calls = vi.mocked(request).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(vi.mocked(request).mock.calls.length).toBe(calls);
  });

  it('ignores errors and malformed answers', async () => {
    vi.mocked(request).mockRejectedValueOnce(new Error('service_unavailable')).mockResolvedValue({});
    const { result } = renderHook(() => useManySteps('many-a', true));
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(result.current).toEqual([]);
  });
});
