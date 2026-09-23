import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/lib/i18n';
import PluginImageField from './PluginImageField';

const images = [
  { id: 'img-1', name: 'foto.png', sitePath: '/dome-recursos-landing/foto.png' },
  { id: 'img-2', name: 'otra.jpg', sitePath: '/assets/otra.jpg' },
];

describe('PluginImageField', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es');
    Object.assign(window.electron, {
      plugins: {
        request: vi.fn(async (_pluginId: string, method: string) => {
          if (method === 'media.list') return { success: true, data: images };
          if (method === 'media.delete') return { success: true, data: { deleted: true, remote: true } };
          return { success: false, error: method };
        }),
      },
      resource: {
        readFile: vi.fn(async () => ({ success: true, data: 'data:image/png;base64,aaa' })),
      },
    });
  });

  it('shows the chosen file in a visual picker instead of the site path', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PluginImageField
        pluginId="dome-cms"
        fieldId="cover"
        label="Cover"
        value="/dome-recursos-landing/foto.png"
        onChange={onChange}
      />,
    );

    expect(await screen.findByText('foto.png')).toBeVisible();
    expect(screen.queryByText('/dome-recursos-landing/foto.png')).toBeNull();

    const pick = await screen.findByRole('button', { name: i18n.t('plugins.image_pick') });
    await waitFor(() => expect(pick).toBeEnabled());
    await user.click(pick);
    expect(await screen.findByText('dome-recursos-landing')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'otra.jpg' }));
    expect(onChange).toHaveBeenCalledWith('/assets/otra.jpg');
  });

  it('deletes an image from the vault and the repository after confirming', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onMediaChange = vi.fn();
    render(
      <PluginImageField
        pluginId="dome-cms"
        fieldId="cover"
        label="Cover"
        value="/dome-recursos-landing/foto.png"
        onChange={onChange}
        onMediaChange={onMediaChange}
      />,
    );

    const pick = await screen.findByRole('button', { name: i18n.t('plugins.image_pick') });
    await waitFor(() => expect(pick).toBeEnabled());
    await user.click(pick);
    await user.click(screen.getByRole('button', { name: i18n.t('plugins.image_delete', { name: 'foto.png' }) }));
    expect(await screen.findByText(i18n.t('plugins.image_delete_confirm', { name: 'foto.png' }))).toBeVisible();
    await user.click(screen.getByRole('button', { name: i18n.t('common.delete') }));

    await waitFor(() => {
      expect(window.electron.plugins.request).toHaveBeenCalledWith('dome-cms', 'media.delete', { id: 'img-1' });
    });
    expect(onChange).toHaveBeenCalledWith('');
    expect(onMediaChange).toHaveBeenCalled();
  });
});
