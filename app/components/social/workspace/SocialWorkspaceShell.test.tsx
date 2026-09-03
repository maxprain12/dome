import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialPost } from '@/components/social/socialTypes';
import i18n from '@/lib/i18n';
import { formatSocialBody, SocialWorkspaceShell } from './SocialWorkspaceShell';

const workspaceData: {
  posts: SocialPost[];
  accounts: unknown[];
  campaigns: unknown[];
  growth: unknown[];
  replyDrafts: unknown[];
  lastSyncAt: number | null;
  metricsStale: boolean;
} = {
  posts: [],
  accounts: [],
  campaigns: [],
  growth: [],
  replyDrafts: [],
  lastSyncAt: null,
  metricsStale: false,
};

describe('SocialWorkspaceShell', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es');
    workspaceData.posts = [];
    vi.mocked(window.electron.invoke).mockImplementation(async (channel: string, payload?: unknown) => {
      if (channel === 'social:workspace') return { success: true, data: workspaceData };
      if (channel === 'social:growth') {
        return { success: true, data: { accounts: workspaceData.growth, days: (payload as { days?: number })?.days ?? 30 } };
      }
      if (channel === 'social:event-cards:list') {
        return { success: true, data: { cards: [] } };
      }
      if (channel === 'social:reports:list') {
        return {
          success: true,
          data: {
            reports: [],
            config: { intervalHours: 0, periodDays: 30, language: 'es' },
          },
        };
      }
      if (channel === 'social:campaigns:create') {
        return {
          success: true,
          data: {
            id: 'campaign-1',
            name: 'Lanzamiento',
            goal: 'Dar a conocer el producto',
            status: 'active',
            createdAt: 1,
            updatedAt: 1,
            draft: 0,
            scheduled: 0,
            published: 0,
            failed: 0,
          },
        };
      }
      return { success: true, data: [] };
    });
  });

  it('navigates with a contextual tab bar and does not render a nested sidebar', async () => {
    const user = userEvent.setup();
    render(<SocialWorkspaceShell />);

    expect(await screen.findByRole('heading', { name: 'Todas las redes' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Resumen de rendimiento' })).toBeVisible();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Todo' })).toHaveTextContent('Todo');
    await user.click(screen.getByRole('tab', { name: 'Contenido' }));
    expect(screen.getByRole('heading', { name: 'Contenido' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: /tarjetas/i })).not.toBeInTheDocument();
  });

  it('creates campaigns through an accessible form instead of browser prompts', async () => {
    const user = userEvent.setup();
    render(<SocialWorkspaceShell />);

    await user.click(await screen.findByRole('tab', { name: 'Campañas' }));
    await user.click(screen.getAllByRole('button', { name: 'Nueva' })[0]);
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre de la campaña'), 'Lanzamiento');
    await user.type(within(dialog).getByLabelText('Objetivo / brief (opcional)'), 'Dar a conocer el producto');
    await user.click(within(dialog).getByRole('button', { name: 'Nueva' }));

    await waitFor(() => {
      expect(window.electron.invoke).toHaveBeenCalledWith('social:campaigns:create', {
        name: 'Lanzamiento',
        goal: 'Dar a conocer el producto',
      });
    });
    expect(await screen.findByRole('heading', { name: 'Lanzamiento' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeInTheDocument();
  });

  it('opens a recent post from the overview canvas into the content ficha', async () => {
    const user = userEvent.setup();
    workspaceData.posts = [
      {
        id: 'sp-recent',
        accountId: 'acc-1',
        provider: 'instagram',
        status: 'published',
        body: 'Foto del estudio',
        media: [],
        linkUrl: null,
        topics: [],
        campaign: null,
        scheduledAt: null,
        publishedAt: Date.now(),
        externalPostId: 'ig-1',
        externalUrl: null,
        error: null,
        notes: null,
        createdBy: 'user',
        groupId: null,
        createdAt: 1,
        updatedAt: 1,
        metrics: {
          id: 'm-recent',
          postId: 'sp-recent',
          capturedAt: 1,
          impressions: 80,
          likes: 12,
          comments: 3,
          shares: 1,
          saves: null,
          clicks: null,
          followers: null,
        },
      },
    ];

    render(<SocialWorkspaceShell />);
    expect(await screen.findByRole('heading', { name: 'Publicaciones recientes' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Foto del estudio/i }));
    expect(screen.getByRole('heading', { name: 'Contenido' })).toBeVisible();
    expect(await screen.findByRole('tab', { name: 'Resumen' })).toBeVisible();
    workspaceData.posts = [];
  });

  it('opens the dedicated composer workspace', async () => {
    const user = userEvent.setup();
    render(<SocialWorkspaceShell />);

    await user.click(await screen.findByRole('button', { name: 'Nueva publicación' }));
    expect(screen.getByRole('heading', { name: 'Nueva publicación' })).toBeVisible();
    expect(screen.getByText('Destinos')).toBeVisible();
  });

  it('renders insights using the reports list from the IPC response envelope', async () => {
    const user = userEvent.setup();
    render(<SocialWorkspaceShell />);

    await user.click(await screen.findByRole('tab', { name: 'Insights' }));

    expect(screen.getByRole('heading', { name: 'Insights' })).toBeVisible();
    expect(await screen.findByText('Aún no hay informes')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ver leads' })).toBeVisible();
    expect(window.electron.invoke).toHaveBeenCalledWith('social:reports:list');
    expect(window.electron.invoke).toHaveBeenCalledWith('social:growth', { days: 30 });
  });

  it('renders the accounts section with localized copy', async () => {
    const user = userEvent.setup();
    render(<SocialWorkspaceShell />);

    await user.click(await screen.findByRole('tab', { name: 'Cuentas' }));

    expect(await screen.findByRole('heading', { name: 'Cuentas' })).toBeVisible();
    expect(screen.getByText('Selecciona una cuenta')).toBeVisible();
  });

  it('opens a post inspector with summary/comments/notes tabs and saves notes', async () => {
    const user = userEvent.setup();
    const publishedPost = {
      id: 'sp-1',
      accountId: 'acc-1',
      provider: 'linkedin' as const,
      status: 'published' as const,
      body: 'Hola mundo Dome',
      media: [],
      linkUrl: null,
      topics: ['IA'],
      campaign: null,
      scheduledAt: null,
      publishedAt: Date.now(),
      externalPostId: 'urn:li:share:1',
      externalUrl: 'https://www.linkedin.com/feed/update/urn:li:share:1',
      error: null,
      notes: null,
      createdBy: 'user',
      groupId: null,
      createdAt: 1,
      updatedAt: 1,
      metrics: {
        id: 'm1',
        postId: 'sp-1',
        capturedAt: 1,
        impressions: 10,
        likes: 2,
        comments: 1,
        shares: 0,
        saves: null,
        clicks: null,
        followers: null,
      },
    };
    workspaceData.posts = [publishedPost];

    vi.mocked(window.electron.invoke).mockImplementation(async (channel: string, payload?: unknown) => {
      if (channel === 'social:workspace') return { success: true, data: workspaceData };
      if (channel === 'social:reports:list') {
        return {
          success: true,
          data: { reports: [], config: { intervalHours: 0, periodDays: 30, language: 'es' } },
        };
      }
      if (channel === 'social:comments:list') {
        return {
          success: true,
          data: {
            comments: [
              {
                id: 'c1',
                text: 'Gran post',
                authorName: 'Ana',
                authorExternalId: 'x',
                createdAt: Date.now(),
                permalink: null,
              },
            ],
            nextCursor: undefined,
            unsupported: false,
          },
        };
      }
      if (channel === 'social:posts:updateNotes') {
        const body = payload as { postId: string; notes: string | null };
        const updated = { ...publishedPost, notes: body.notes };
        workspaceData.posts = [updated];
        return { success: true, data: updated };
      }
      return { success: true, data: [] };
    });

    render(<SocialWorkspaceShell />);
    await user.click(await screen.findByRole('tab', { name: 'Contenido' }));
    await user.click(await screen.findByRole('button', { name: /Hola mundo Dome/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Resumen' })).toBeVisible();
    expect(screen.getByRole('tab', { name: /Comentarios/ })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Notas' })).toBeVisible();
    expect(screen.getAllByText('Hola mundo Dome').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('tab', { name: /Comentarios/ }));
    expect(await screen.findByText('Gran post')).toBeVisible();
    expect(screen.getByText('Ana')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Notas' }));
    await user.type(screen.getByLabelText('Notas internas'), 'Recordar follow-up');
    await user.click(screen.getByRole('button', { name: 'Guardar notas' }));

    await waitFor(() => {
      expect(window.electron.invoke).toHaveBeenCalledWith('social:posts:updateNotes', {
        postId: 'sp-1',
        notes: 'Recordar follow-up',
      });
    });

    workspaceData.posts = [];
  });
});

describe('formatSocialBody', () => {
  it('removes LinkedIn transport syntax from mentions and hashtags', () => {
    expect(formatSocialBody(
      'Gracias @[María Sugasa](urn:li:person:abc) {hashtag|\\#IA} {hashtag|#DevOps}',
    )).toBe('Gracias @María Sugasa #IA #DevOps');
  });
});
