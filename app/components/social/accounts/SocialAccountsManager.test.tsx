import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { SocialAccountsManager } from './SocialAccountsManager';

vi.mock('@/lib/hooks/useCloudEntitlements', () => ({ useCloudEntitlements: () => ({ hasSocialCloud: false }) }));

it('keeps adding Instagram accounts available and saves edited credentials before OAuth', async () => {
  await i18n.changeLanguage('es');
  const user = userEvent.setup();
  vi.mocked(window.electron.invoke).mockImplementation(async (channel) => {
    if (channel === 'social:providers:status') return { success: true, data: { providers: [{ provider: 'instagram', clientId: 'existing', hasClientSecret: true, redirectUri: 'http://localhost:8737/callback/instagram' }] } };
    if (channel === 'social:accounts:list') return { success: true, data: [{ id: 'ig-a', provider: 'instagram', handle: '@first', status: 'active' }] };
    if (channel === 'social:connect-oauth') return { success: false, error: 'OAuth denied' };
    return { success: true };
  });
  render(<SocialAccountsManager />);
  await user.click(await screen.findByRole('button', { name: /Añadir otra cuenta/ }));
  await user.click(screen.getByRole('button', { name: 'Conectar' }));
  const dialog = screen.getByRole('dialog');
  const input = within(dialog).getByLabelText('Client ID');
  await user.clear(input);
  await user.type(input, 'updated');
  await user.click(within(dialog).getByRole('button', { name: 'Conectar cuenta' }));
  await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('OAuth denied'));
  const calls = vi.mocked(window.electron.invoke).mock.calls;
  const saveIndex = calls.findIndex(([channel]) => channel === 'social:providers:set-config');
  const connectIndex = calls.findIndex(([channel]) => channel === 'social:connect-oauth');
  expect(saveIndex).toBeLessThan(connectIndex);
  expect(calls[saveIndex][1]).toMatchObject({ clientId: 'updated' });
  expect(within(dialog).getByRole('button', { name: 'Conectar cuenta' })).toBeEnabled();
});
