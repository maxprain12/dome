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

it('uses saved evidence and configured search tools while preserving own-account workflows', () => {
  const hint = buildSharedResourceHint({ pathname: '/' });
  expect(hint).toContain('social_reference_list/resource_search/resource_get');
  expect(hint).toContain('OWN social accounts/posts: call social_accounts_list first');
  expect(hint).toContain('External search uses configured MCP tools or invoked skills');
  expect(hint).not.toContain('research_capabilities');
  expect(hint).not.toContain('research_search');
});
