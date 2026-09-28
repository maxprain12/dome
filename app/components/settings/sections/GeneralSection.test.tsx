import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import i18n from '@/lib/i18n';
import GeneralSection from './GeneralSection';
const state = vi.hoisted(() => ({ name: 'Test profile', email: '', updateUserProfile: vi.fn(), loadUserProfile: vi.fn() }));
vi.mock('@/lib/store/useUserStore', () => ({ useUserStore: () => state }));
vi.mock('@/lib/hooks/useDomeSession', () => ({ useDomeSession: () => ({ connected: false }) }));
vi.mock('@/components/account/AccountAccessPanel', () => ({ default: () => null }));
vi.mock('@/components/user/UserAvatar', () => ({ default: () => null }));
vi.mock('@/lib/settings', () => ({ getAnalyticsEnabled: vi.fn().mockResolvedValue(false), setAnalyticsEnabled: vi.fn() }));
beforeEach(async () => { await i18n.changeLanguage('en'); });
it('only shows saved after profile persistence finishes', async () => {
  let finish!: () => void;
  state.updateUserProfile.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  render(<GeneralSection />);
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Updated profile' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  finish();
  expect(await screen.findByText('Saved')).toBeVisible();
});
it('shows a retryable error rather than saved when the profile write fails', async () => {
  state.updateUserProfile.mockRejectedValueOnce(new Error('disk'));
  render(<GeneralSection />);
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Updated profile' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled());
});

it('shows pending changes, avoids unchanged saves, and submits with Enter', async () => {
  state.updateUserProfile.mockResolvedValueOnce(undefined);
  render(<GeneralSection />);
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  const input = screen.getByLabelText('Full name');
  await userEvent.clear(input);
  await userEvent.type(input, 'New profile');
  expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
  await userEvent.keyboard('{Enter}');
  await waitFor(() => expect(state.updateUserProfile).toHaveBeenCalledWith({ name: 'New profile', email: '' }));
  expect(await screen.findByText('Saved')).toBeVisible();
});
