import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSocialWorkspace } from './useSocialWorkspace';

const payload = { accounts: [{ id: 'ig-b', provider: 'instagram', handle: '@second', status: 'active' }], posts: [], lastSyncAt: 123 };

describe('useSocialWorkspace', () => {
  it('leaves loading and exposes an IPC failure without five fallback requests', async () => {
    vi.mocked(window.electron.invoke).mockResolvedValue({ success: false, error: 'Vault unavailable' });
    const { result } = renderHook(() => useSocialWorkspace());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Vault unavailable');
    expect(window.electron.invoke).toHaveBeenCalledTimes(1);
  });

  it('shows a partial account error and reloads the authoritative metrics payload', async () => {
    vi.mocked(window.electron.invoke).mockImplementation(async (channel) => {
      if (channel === 'social:workspace') return { success: true, data: payload };
      return { success: true, data: { accounts: [{ accountId: 'ig-b', error: 'Permission denied' }] } };
    });
    const { result } = renderHook(() => useSocialWorkspace());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.syncFeed('ig-b'); });
    expect(window.electron.invoke).toHaveBeenCalledWith('social:posts:sync', { accountId: 'ig-b', limit: 25 });
    expect(result.current.error).toContain('@second');
    expect(result.current.error).toContain('Permission denied');
    expect(result.current.lastSyncAt).toBe(123);
    expect(result.current.refreshing).toBe(false);
  });

  it('releases busy state when the transport rejects', async () => {
    vi.mocked(window.electron.invoke).mockResolvedValue({ success: true, data: payload });
    const { result } = renderHook(() => useSocialWorkspace());
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(window.electron.invoke).mockRejectedValueOnce(new Error('Transport disconnected'));
    await act(async () => { await result.current.syncFeed('ig-b'); });
    expect(result.current.error).toBe('Transport disconnected');
    expect(result.current.refreshing).toBe(false);
  });
});
