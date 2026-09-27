import { beforeEach, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { useUserStore } from '@/lib/store/useUserStore';
import { completeWelcome } from './completeWelcome';
beforeEach(() => useUserStore.setState({ isOnboardingCompleted: false, name: '', email: '' }));
it('does not finish when persisting the completion flag fails', async () => {
  vi.spyOn(db, 'setSetting').mockResolvedValue({ success: false, error: 'disk_full' });
  await expect(completeWelcome()).rejects.toThrow('disk_full');
  expect(useUserStore.getState().isOnboardingCompleted).toBe(false);
});
it('does not save completion after identity persistence fails', async () => {
  const write = vi.spyOn(db, 'setSetting').mockResolvedValue({ success: false, error: 'disk_full' });
  await expect(completeWelcome({ name: 'Ada', email: 'ada@example.com' })).rejects.toThrow();
  expect(write).not.toHaveBeenCalledWith('onboarding_completed', 'true');
});
it('local entry writes only completion and preserves configured identity', async () => {
  useUserStore.setState({ name: 'Ada', email: 'ada@example.com' });
  const write = vi.spyOn(db, 'setSetting').mockResolvedValue({ success: true });
  await completeWelcome();
  expect(write.mock.calls).toEqual([['onboarding_completed', 'true']]);
  expect(useUserStore.getState()).toMatchObject({ isOnboardingCompleted: true, name: 'Ada' });
});
