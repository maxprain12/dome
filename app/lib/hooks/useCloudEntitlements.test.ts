import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useCloudEntitlements } from './useCloudEntitlements';
it('ignores a paid response from before logout and immediately removes access while revalidating', async () => {
  let resolvePaid!: (value: unknown) => void;
  let sessionChanged!: () => void;
  const getEntitlements = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolvePaid = resolve; })).mockResolvedValue({ success: true, fetchOk: true, connected: false });
  Object.assign(window.electron, {
    domainSync: { getEntitlements }, domeAuth: { onSessionState: (cb: () => void) => { sessionChanged = cb; return vi.fn(); } },
  });
  const { result } = renderHook(useCloudEntitlements);
  await act(async () => { sessionChanged(); });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { resolvePaid({ success: true, fetchOk: true, connected: true, subscribed: true, features: ['cloud_sync'] }); });
  expect(result.current.tier).toBe('local');
  expect(result.current.hasCloudSync).toBe(false);
});
it('keeps fetch failures distinct from an unsubscribed account and retries without cache', async () => {
  const getEntitlements = vi.fn().mockResolvedValueOnce({ success: true, fetchOk: false }).mockResolvedValue({ success: true, fetchOk: true, connected: true, subscribed: true, features: ['social_cloud'] });
  Object.assign(window.electron, { domainSync: { getEntitlements } });
  const { result } = renderHook(useCloudEntitlements);
  await waitFor(() => expect(result.current.error).toBe(true));
  await act(async () => { await result.current.refresh(); });
  expect(getEntitlements).toHaveBeenLastCalledWith({ forceRefresh: true });
  expect(result.current.hasSocialCloud).toBe(true);
  expect(result.current.hasCloudSync).toBe(false);
});
