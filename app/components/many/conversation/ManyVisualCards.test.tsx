import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ManyAssistantVisualBody, ManyReferenceCards } from './ManyVisualCards';

describe('ManyReferenceCards', () => {
  it('shows the last post as a row card, not connected-account profiles', () => {
    render(
      <ManyReferenceCards
        calls={[
          {
            name: 'social_accounts_list',
            status: 'success',
            result: {
              success: true,
              accounts: [{ provider: 'instagram', displayName: 'Dome', handle: 'dome_la' }],
            },
          },
          {
            name: 'social_metrics_summary',
            status: 'success',
            result: {
              success: true,
              summary: {
                recentPosts: [
                  {
                    id: 'sp-hidden',
                    provider: 'instagram',
                    body: 'Día de Chongqing, China — Sony Alpha 7 II',
                    status: 'published',
                    publishedAt: 1_800_000_000_000,
                    externalUrl: 'https://instagram.com/p/abc',
                    source: { authorName: 'Alder V. Obando', authorHandle: 'ad.vo2' },
                    metrics: { impressions: 233, likes: 18, comments: 0, saves: 1 },
                  },
                ],
              },
            },
          },
        ]}
      />,
    );
    expect(screen.getAllByText('@ad.vo2').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Chongqing/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Dome')).not.toBeInTheDocument();
    expect(screen.queryByText('sp-hidden')).not.toBeInTheDocument();
    expect(screen.getByText('233')).toBeInTheDocument();
  });
});

describe('ManyAssistantVisualBody', () => {
  it('renders metric tables as a compact overview, not an artifact toolbar', () => {
    render(
      <MemoryRouter>
        <ManyAssistantVisualBody
          content={[
            'Aquí va el análisis.',
            '',
            '| Métrica | Valor |',
            '| --- | --- |',
            '| Likes | 18 |',
          ].join('\n')}
          allowStreaming={false}
          citationMap={undefined}
          onClickCitation={() => {}}
          showCaret={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Likes')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.queryByText('Copy')).not.toBeInTheDocument();
    expect(screen.queryByText('Métrica')).not.toBeInTheDocument();
  });

  it('renders comparison tables as slim bars without markdown markers', () => {
    render(
      <MemoryRouter>
        <ManyAssistantVisualBody
          content={[
            '| Post | Imp | Likes |',
            '| --- | --- | --- |',
            '| **Chongqing** | 233 | 18 |',
            '| China 2 | 609 | 44 |',
          ].join('\n')}
          allowStreaming={false}
          citationMap={undefined}
          onClickCitation={() => {}}
          showCaret={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Chongqing')).toBeInTheDocument();
    expect(screen.queryByText('**Chongqing**')).not.toBeInTheDocument();
    expect(screen.getByText('233')).toBeInTheDocument();
    expect(screen.getByText('609')).toBeInTheDocument();
    expect(screen.queryByText('Copy')).not.toBeInTheDocument();
    expect(screen.queryByText('Imp')).not.toBeInTheDocument();
  });
});
