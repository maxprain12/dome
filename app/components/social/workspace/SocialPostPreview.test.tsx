import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { SocialPostMedia } from './SocialPostPreview';

it('plays a remote reel instead of showing the unavailable placeholder', async () => {
  await i18n.changeLanguage('es');
  render(
    <SocialPostMedia
      media={[{
        type: 'reel',
        url: 'https://cdn.example.test/reel.mp4',
        thumbnailUrl: 'https://cdn.example.test/reel.jpg',
        alt: 'Reel de Dome',
      }]}
    />,
  );
  const video = screen.getByLabelText('Reel de Dome');
  expect(video.tagName).toBe('VIDEO');
  expect(video).toHaveAttribute('src', 'https://cdn.example.test/reel.mp4');
  expect(video).toHaveAttribute('poster', 'https://cdn.example.test/reel.jpg');
  expect(video).toHaveAttribute('referrerpolicy', 'no-referrer');
  expect(screen.queryByText(/Este medio no está disponible/)).not.toBeInTheDocument();
});

it('falls back to the reel thumbnail when the video file cannot load', async () => {
  await i18n.changeLanguage('es');
  render(
    <SocialPostMedia
      media={[{
        type: 'reel',
        url: 'https://cdn.example.test/reel.mp4',
        thumbnailUrl: 'https://cdn.example.test/reel.jpg',
        alt: 'Reel de Dome',
      }]}
    />,
  );
  fireEvent.error(screen.getByLabelText('Reel de Dome'));
  const still = screen.getByAltText('Reel de Dome');
  expect(still.tagName).toBe('IMG');
  expect(still).toHaveAttribute('src', 'https://cdn.example.test/reel.jpg');
});

it('shows a local still for a scheduled post without a public URL', async () => {
  await i18n.changeLanguage('es');
  vi.mocked(window.electron.invoke).mockImplementation(async (channel: string) => {
    if (channel === 'social:media:preview') {
      return { success: true, data: { dataUrl: 'data:image/jpeg;base64,abc', kind: 'image' } };
    }
    return { success: true };
  });
  render(
    <SocialPostMedia
      media={[{
        type: 'image',
        path: '/Users/max/Pictures/chongqing.jpg',
        name: 'chongqing.jpg',
        alt: 'Chongqing',
      }]}
    />,
  );
  const still = await waitFor(() => screen.getByAltText('Chongqing'));
  expect(still.tagName).toBe('IMG');
  expect(still).toHaveAttribute('src', 'data:image/jpeg;base64,abc');
  expect(window.electron.invoke).toHaveBeenCalledWith('social:media:preview', {
    path: '/Users/max/Pictures/chongqing.jpg',
    resourceId: undefined,
    storagePath: undefined,
  });
  expect(screen.queryByText(/Este medio no está disponible/)).not.toBeInTheDocument();
});
