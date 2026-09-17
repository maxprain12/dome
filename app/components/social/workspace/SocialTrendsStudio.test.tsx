import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { SocialTrendsStudio } from './SocialTrendsStudio';

const cluster = {
  id: 'radar:local:ai',
  topicKey: 'ai',
  title: '#ai',
  phase: 'emerging',
  confidence: 0.4,
  saturation: 0.2,
  trendScore: 0.55,
  affinity: 0.3,
  forYouScore: 0.4,
  burst: 0.6,
  velocity: 0.4,
  breadth: 0.3,
  freshness: 0.8,
  networks: ['instagram'],
  authorCount: 2,
  postCount: 3,
  evidence: [{ id: 'sr-1', title: 'Reel de lanzamiento', provider: 'instagram', origin: 'reference' }],
  source: 'local',
  nativeTrend: false,
  whyForYou: 'Matches topics you already publish or save.',
  topics: ['ai'],
};

describe('SocialTrendsStudio', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es');
    vi.mocked(window.electron.invoke).mockImplementation(async (channel: string) => {
      if (channel === 'social:trends:snapshot') {
        return {
          success: true,
          data: {
            windowDays: 30,
            generatedAt: Date.now(),
            ownPostCount: 1,
            referenceCount: 2,
            signals: [],
            formats: [{ format: 'reel', count: 2 }],
            recommendedFormat: 'reel',
            limitations: ['own_and_references_only', 'no_platform_explore'],
            feeds: {
              radar: [cluster],
              forYou: [],
              emerging: [],
              popular: [],
            },
          },
        };
      }
      if (channel === 'social:trends:event' || channel === 'social:trends:create-from') {
        return { success: true, data: { seed: { body: 'Angle', topics: ['ai'] } } };
      }
      return { success: true, data: {} };
    });
  });

  it('shows four feeds and human cluster labels, not ids', async () => {
    const user = userEvent.setup();
    render(<SocialTrendsStudio />);
    expect(await screen.findByRole('button', { name: 'Tu radar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Para ti' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Emergentes' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Populares' })).toBeVisible();
    expect(screen.getByText('#ai')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Crear' })).toBeVisible();
    expect(screen.queryByText('radar:local:ai')).not.toBeInTheDocument();
    expect(screen.queryByText('Matches topics you already publish or save.')).not.toBeInTheDocument();
    expect(screen.queryByText('Weak local fit; useful as a contrast, not a default.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Para ti' }));
    await waitFor(() => {
      expect(screen.getByText('Aún no hay un Para ti con evidencia')).toBeVisible();
    });
  });

  it('shows loading instead of the empty dashboard', async () => {
    let resolveSnapshot: ((value: unknown) => void) | undefined;
    vi.mocked(window.electron.invoke).mockImplementation(async (channel: string) => {
      if (channel === 'social:trends:snapshot') {
        return new Promise((resolve) => {
          resolveSnapshot = resolve;
        });
      }
      return { success: true, data: {} };
    });
    render(<SocialTrendsStudio />);
    expect(await screen.findByText('Calculando tu radar…')).toBeVisible();
    resolveSnapshot?.({
      success: true,
      data: {
        windowDays: 30,
        generatedAt: Date.now(),
        ownPostCount: 0,
        referenceCount: 0,
        signals: [],
        formats: [],
        limitations: [],
        feeds: { radar: [], forYou: [], emerging: [], popular: [] },
      },
    });
    expect(await screen.findByText('Aún no hay señales de tendencia')).toBeVisible();
  });
});
