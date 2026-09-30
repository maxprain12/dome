import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSocialCreatorHistory } from './useSocialCreatorHistory';

beforeEach(() => vi.mocked(window.electron.invoke).mockReset());

it('loads all creator pages rather than the project recent-reference preview', async () => {
  vi.mocked(window.electron.invoke).mockImplementation(async (channel, input) => {
    if (channel !== 'social:references:list') return { success: true, data: {} };
    const { offset } = input as { offset: number };
    return { success: true, data: offset === 0 ? Array.from({ length: 400 }, (_, i) => ({ id: String(i) })) : [{ id: 'oldest' }] };
  });
  const { result } = renderHook(() => useSocialCreatorHistory('project', 'creator'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.records).toHaveLength(401);
  expect(window.electron.invoke).toHaveBeenCalledWith('social:references:list', { projectId: 'project', personId: 'creator', offset: 400, limit: 400 });
});

it('ignores a late response from the previously selected creator', async () => {
  let resolveFirst: (result: unknown) => void = () => {};
  vi.mocked(window.electron.invoke).mockImplementation(async (channel, input) => {
    if (channel !== 'social:references:list') return { success: true, data: {} };
    if ((input as { personId: string }).personId === 'first') return new Promise((resolve) => { resolveFirst = resolve; });
    return { success: true, data: [{ id: 'second-post' }] };
  });
  const { result, rerender } = renderHook(({ personId }) => useSocialCreatorHistory('project', personId), { initialProps: { personId: 'first' } });
  rerender({ personId: 'second' });
  await waitFor(() => expect(result.current.records[0]?.id).toBe('second-post'));
  await act(async () => resolveFirst({ success: true, data: [{ id: 'first-post' }] }));
  expect(result.current.records[0]?.id).toBe('second-post');
});
