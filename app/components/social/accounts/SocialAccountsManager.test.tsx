import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { SocialAccountsManager } from './SocialAccountsManager';

const cloudState = vi.hoisted(() => ({ hasSocialCloud: false }));

vi.mock('@/lib/hooks/useCloudEntitlements', () => ({
  useCloudEntitlements: () => cloudState,
}));

async function renderAccounts() {
  vi.mocked(window.electron.invoke).mockImplementation(async (channel) => {
    if (channel === 'social:providers:status') {
      return {
        success: true,
        data: {
          providers: [{
            provider: 'instagram',
            clientId: 'existing',
            hasClientSecret: true,
            redirectUri: 'https://dome.dowi.es/oauth/instagram/callback',
          }],
        },
      };
    }
    if (channel === 'social:accounts:list') {
      return { success: true, data: [{ id: 'ig-a', provider: 'instagram', handle: '@first', status: 'active' }] };
    }
    if (channel === 'social:connect-oauth') return { success: false, error: 'OAuth denied' };
    return { success: true };
  });
  return render(<SocialAccountsManager />);
}

it('warns that disconnect deletes this account’s Social data', async () => {
  await i18n.changeLanguage('es');
  cloudState.hasSocialCloud = false;
  const user = userEvent.setup();
  await renderAccounts();
  await user.click(await screen.findByRole('button', { name: 'Desconectar cuenta' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog).toHaveTextContent(/Se borrarán de Social todos los posts, borradores, métricas e importados/);
  expect(dialog).not.toHaveTextContent(/Los borradores se quedan/);
});

it('opens the connect dialog from a network row and saves credentials before OAuth', async () => {
  await i18n.changeLanguage('es');
  cloudState.hasSocialCloud = false;
  const user = userEvent.setup();
  await renderAccounts();
  expect(await screen.findByRole('heading', { name: 'Redes sociales' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Publicación en la nube' })).toBeVisible();
  expect(screen.getByText(/Hace falta Social Cloud/)).toBeVisible();
  expect(screen.getByRole('switch', { name: 'Publicación en la nube: @first' })).toHaveAttribute('aria-disabled', 'true');
  await user.click(screen.getByRole('button', { name: 'Añadir otra cuenta' }));
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

it('labels cloud publishing and enables it when Social Cloud is in the plan', async () => {
  await i18n.changeLanguage('es');
  cloudState.hasSocialCloud = true;
  await renderAccounts();
  const toggle = await screen.findByRole('switch', { name: 'Publicación en la nube: @first' });
  expect(toggle).toBeEnabled();
  expect(screen.getByText(/Dome Cloud/)).toBeVisible();
  expect(screen.getByText(/publicar esta cuenta aunque Dome esté cerrado/)).toBeVisible();
});
