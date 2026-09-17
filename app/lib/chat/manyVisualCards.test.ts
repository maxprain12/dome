import { describe, expect, it } from 'vitest';
import type { ToolCallData } from '@/components/chat/ChatToolCard';
import {
  asRenderableArtifact,
  collectSocialInsight,
  collectSocialReferenceCards,
  flattenToolDisplayCalls,
  parseAssistantVisualSegments,
  scrubOpaqueIdsFromProse,
} from './manyVisualCards';

function call(partial: Partial<ToolCallData> & Pick<ToolCallData, 'name'>): ToolCallData {
  return {
    id: partial.id ?? partial.name,
    name: partial.name,
    arguments: partial.arguments ?? {},
    status: partial.status ?? 'success',
    result: partial.result,
    error: partial.error,
  };
}

const lastPost = {
  id: 'sp-deadbeef',
  provider: 'instagram' as const,
  body: 'Día de Chongqing, China — Sony Alpha 7 II',
  status: 'published' as const,
  publishedAt: 1_800_000_000_000,
  externalUrl: 'https://instagram.com/p/abc',
  source: { authorName: 'Alder V. Obando', authorHandle: 'ad.vo2' },
  metrics: { impressions: 233, likes: 18, comments: 0, saves: 1 },
  topics: ['Travel photography'],
};

describe('collectSocialReferenceCards', () => {
  it('promotes a fetched post into a card without exposing the post id', () => {
    const cards = collectSocialReferenceCards([
      call({ name: 'social_post_get', result: { success: true, post: lastPost } }),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.kind).toBe('post');
    expect(cards[0]?.model.body).toContain('Chongqing');
    expect(cards[0]?.model.author.handle).toBe('ad.vo2');
    expect(JSON.stringify(cards[0])).not.toContain('sp-deadbeef');
  });

  it('ignores connected-account profiles and uses the latest published post from metrics', () => {
    const cards = collectSocialReferenceCards([
      call({
        name: 'social_accounts_list',
        result: {
          success: true,
          accounts: [
            { provider: 'instagram', displayName: 'Dome', handle: 'dome_la' },
            { provider: 'instagram', displayName: 'Alder V. Obando', handle: 'ad.vo2' },
          ],
        },
      }),
      call({
        name: 'social_metrics_summary',
        result: {
          success: true,
          summary: {
            recentPosts: [lastPost],
            topPosts: [lastPost],
          },
        },
      }),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.kind).toBe('post');
    expect(cards[0]?.model.author.handle).toBe('ad.vo2');
  });
});

describe('collectSocialInsight', () => {
  it('builds KPIs and a comparison from recent posts', () => {
    const older = {
      ...lastPost,
      id: 'sp-older',
      body: 'China 2',
      publishedAt: 1_700_000_000_000,
      externalUrl: 'https://instagram.com/p/older',
      metrics: { impressions: 609, likes: 44, comments: 0, saves: 0 },
    };
    const insight = collectSocialInsight([
      call({
        name: 'social_metrics_summary',
        result: { success: true, summary: { recentPosts: [lastPost, older] } },
      }),
    ]);
    expect(insight?.title).toContain('Chongqing');
    expect(insight?.kpis.some((kpi) => kpi.label === 'impressions' && kpi.value === '233')).toBe(true);
    expect(insight?.comparison).toHaveLength(2);
    expect(JSON.stringify(insight)).not.toContain('sp-deadbeef');
  });
});

describe('flattenToolDisplayCalls', () => {
  it('walks groups and subagents in display order', () => {
    const a = call({ id: 'a', name: 'social_post_get' });
    const b = call({ id: 'b', name: 'social_metrics_summary' });
    const c = call({ id: 'c', name: 'social_post_get' });
    expect(
      flattenToolDisplayCalls([
        { type: 'tool', call: a },
        { type: 'tool-group', name: 'social_post_get', calls: [b, c] },
        {
          type: 'subagent',
          agentKey: 'research',
          agentLabel: 'Research',
          blocks: [{ type: 'tool', call: call({ id: 'd', name: 'web_search' }) }],
        },
      ]).map((item) => item.id),
    ).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('parseAssistantVisualSegments', () => {
  it('turns an analysis dashboard fence into a renderable artifact', () => {
    const segments = parseAssistantVisualSegments(
      'Aquí va el análisis.\n```artifact:dashboard\n{"type":"dashboard","title":"Análisis del último post","kpis":[{"label":"Likes","value":42}]}\n```\n',
    );
    const artifact = segments.find((segment) => segment.kind === 'artifact');
    expect(artifact?.kind).toBe('artifact');
    if (artifact?.kind !== 'artifact') throw new Error('expected artifact');
    const rendered = asRenderableArtifact(artifact.value);
    expect(rendered?.type).toBe('dashboard');
    expect(rendered && 'title' in rendered ? rendered.title : null).toBe('Análisis del último post');
  });

  it('lifts markdown metric tables into a dashboard and scrubs opaque ids', () => {
    expect(scrubOpaqueIdsFromProse('Tu último publicado (sp-db87ead336697931) es el de Chongqing')).toBe(
      'Tu último publicado es el de Chongqing',
    );
    const segments = parseAssistantVisualSegments(
      [
        'Tu último publicado (sp-aaaaaa111111) es el de Chongqing.',
        '',
        '| Métrica | Valor | Ratio |',
        '| --- | --- | --- |',
        '| Impresiones | 233 | — |',
        '| Likes | 18 | 7.7% |',
        '',
      ].join('\n'),
    );
    expect(segments.some((segment) => segment.kind === 'text' && segment.content.includes('sp-'))).toBe(false);
    const artifact = segments.find((segment) => segment.kind === 'artifact');
    expect(artifact?.kind).toBe('artifact');
    if (artifact?.kind !== 'artifact') throw new Error('expected artifact');
    expect(artifact.value.type).toBe('dashboard');
  });

  it('strips markdown emphasis from comparison labels', () => {
    const segments = parseAssistantVisualSegments(
      ['| Post | Imp | Likes |', '| --- | --- | --- |', '| **Chongqing** | 233 | 18 |', '| China 2 | 609 | 44 |'].join('\n'),
    );
    const artifact = segments.find((segment) => segment.kind === 'artifact');
    expect(artifact?.kind).toBe('artifact');
    if (artifact?.kind !== 'artifact') throw new Error('expected artifact');
    expect(artifact.value.type).toBe('chart');
    const data = artifact.value.data as { labels: string[] };
    expect(data.labels[0]).toBe('Chongqing');
  });
});
