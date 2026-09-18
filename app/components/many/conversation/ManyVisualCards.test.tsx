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

  it('shows a saved note from Desktop tools without the resource id', () => {
    render(
      <ManyReferenceCards
        calls={[
          {
            name: 'resource_create',
            status: 'success',
            result: {
              success: true,
              resource: { id: 'res_hidden', type: 'note', title: 'Briefing de la semana', content: 'Enviar el resumen.' },
            },
          },
        ]}
      />,
    );
    expect(screen.getByText('Briefing de la semana')).toBeInTheDocument();
    expect(screen.getByText('Enviar el resumen.')).toBeInTheDocument();
    expect(screen.queryByText('res_hidden')).not.toBeInTheDocument();
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

  it('renders labeled metric lists as a compact overview and bars', () => {
    render(
      <MemoryRouter>
        <ManyAssistantVisualBody
          content={[
            'He resuelto el perfil.',
            '',
            '📌 Resumen del perfil',
            '',
            '- **Followers:** 57.751',
            '- **Following:** 806',
            '- **Posts totales:** 1.369',
          ].join('\n')}
          allowStreaming={false}
          citationMap={undefined}
          onClickCitation={() => {}}
          showCaret={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByText('Followers').length).toBeGreaterThan(0);
    expect(screen.getAllByText('57.8K').length).toBeGreaterThan(0);
    expect(screen.queryByText('📌 Resumen del perfil')).not.toBeInTheDocument();
  });

  it('renders a calendar artifact without the event id', () => {
    render(
      <MemoryRouter>
        <ManyAssistantVisualBody
          content={'```artifact:calendar_event\n{"type":"calendar_event","title":"Dentista","start_at":"2026-09-18T16:00:00.000Z","end_at":"2026-09-18T17:00:00.000Z","event_id":"evt-hidden","location":"Clínica"}\n```'}
          allowStreaming={false}
          citationMap={undefined}
          onClickCitation={() => {}}
          showCaret={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Dentista')).toBeInTheDocument();
    expect(screen.getByText(/Clínica/)).toBeInTheDocument();
    expect(screen.queryByText('evt-hidden')).not.toBeInTheDocument();
  });
});
