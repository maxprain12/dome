import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
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
