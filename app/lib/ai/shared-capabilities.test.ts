import { describe, expect, it } from 'vitest';
import {
  buildSharedResourceHint,
  buildSharedUiContextBlock,
  getUiLocationDescription,
} from './shared-capabilities';

describe('getUiLocationDescription', () => {
  it('describes the Email shell tab', () => {
    const loc = getUiLocationDescription('/', 'library', 'email');
    expect(loc.location).toBe('Email');
    expect(loc.description).toContain('Email tab');
  });
});

describe('buildSharedUiContextBlock', () => {
  it('mentions email when the Email shell tab is focused', () => {
    const block = buildSharedUiContextBlock({
      pathname: '/',
      shellTabType: 'email',
    });
    expect(block).toContain('email');
    expect(block).toContain('tab-email');
  });
});

describe('buildSharedResourceHint', () => {
  it('steers email questions to email_read first then Sent', () => {
    const hint = buildSharedResourceHint({ pathname: '/' });
    expect(hint).toContain('mentioned-sources');
    expect(hint).toContain('email_read first');
    expect(hint).toContain('Sent folder');
  });
});

it('routes third-party URLs through research capabilities and preserves own-account workflows', () => {
  const hint = buildSharedResourceHint({ pathname: '/' });
  expect(hint).toContain('Third-party profile URLs or person/competitor research: call research_capabilities first');
  expect(hint).toContain('OWN social accounts/posts: call social_accounts_list first');
  expect(hint).toContain('search other public sources via research_search');
  expect(hint).not.toContain('For public URLs call social_public_resolve');
  expect(hint).toContain('Do not attempt direct profile scraping or suggest login/browser_get_active_tab as a content extractor');
});
