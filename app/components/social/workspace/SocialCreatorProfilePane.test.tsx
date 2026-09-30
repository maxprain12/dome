import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { SocialCreatorProfilePane } from './SocialCreatorProfilePane';

beforeEach(async () => { await i18n.changeLanguage('es'); });

it('shows the actual archive period, full biography, counters and partial coverage', () => {
  const bio = 'Biography with all its content visible.';
  render(<SocialCreatorProfilePane
    member={{ personId: 'ada', displayName: 'Ada' }} listLabel="Inspiración"
    profile={{ id: 'profile', body: bio, followers: 900, following: 30, postsCount: 200 }}
    posts={[
      { id: 'old', provider: 'x', kind: 'post', url: 'https://x.com/ada/status/1', publishedAt: Date.UTC(2025, 0, 2) },
      { id: 'new', provider: 'x', kind: 'post', url: 'https://x.com/ada/status/2', publishedAt: Date.UTC(2026, 8, 29) },
    ]}
    exploring={false} onExplore={vi.fn()} onUseInMany={vi.fn()} onRemove={vi.fn()} onPlanPost={vi.fn()}
  />);
  expect(screen.getByText(bio)).not.toHaveClass('line-clamp-3');
  expect(screen.getByText('2 publicaciones guardadas para el análisis')).toBeVisible();
  expect(screen.getByText(/Fechas de publicación disponibles/)).toHaveTextContent('2025');
  expect(screen.getByText(/Historial parcial/)).toBeVisible();
  expect(screen.getByText('publicaciones en el perfil')).toBeVisible();
  expect(screen.getByText('seguidos')).toBeVisible();
});
