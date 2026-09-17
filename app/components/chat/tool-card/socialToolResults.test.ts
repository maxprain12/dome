import { describe, expect, it } from 'vitest';
import { parseSocialToolResult } from './socialToolResults';

describe('parseSocialToolResult', () => {
  it('maps account lists to profile cards without exposing raw ids', () => {
    const view = parseSocialToolResult('social_accounts_list', {
      success: true,
      accounts: [{
        id: 'sa-deadbeef',
        provider: 'instagram',
        displayName: 'Dome',
        handle: 'dome.app',
        avatarUrl: 'https://example.com/a.jpg',
      }],
    });
    expect(view?.type).toBe('profile');
    if (view?.type !== 'profile') throw new Error('expected profile');
    expect(view.model.author.name).toBe('Dome');
    expect(view.model.author.avatarUrl).toContain('a.jpg');
    expect(JSON.stringify(view.model)).not.toContain('sa-deadbeef');
  });

  it('maps public resolve cards including limitations', () => {
    const view = parseSocialToolResult('social_public_resolve', {
      success: true,
      card: {
        provider: 'x',
        kind: 'post',
        url: 'https://x.com/ada/status/1',
        author: { name: 'Ada', handle: 'ada' },
        body: 'Hello',
        limitations: ['og_only', 'metrics_unavailable'],
        fetchMethod: 'open_graph',
      },
    });
    expect(view?.type).toBe('post');
    if (view?.type !== 'post') throw new Error('expected post');
    expect(view.model.limitations).toContain('og_only');
  });
});
