import { describe, expect, it } from 'vitest';
import {
  resolveEmailAddress,
  resolveGithubAssignees,
  resolveGithubLogin,
  resolveSocialHandle,
} from './resolvePersonIdentity';

describe('resolveGithubLogin', () => {
  it('returns github externalId without @', () => {
    expect(
      resolveGithubLogin([{ source: 'github', externalId: '@maxprain', displayLabel: null }]),
    ).toBe('maxprain');
  });

  it('returns null when missing', () => {
    expect(resolveGithubLogin([{ source: 'email', externalId: 'a@b.com' }])).toBeNull();
  });
});

describe('resolveEmailAddress', () => {
  it('prefers primaryEmail', () => {
    expect(
      resolveEmailAddress([{ source: 'email', externalId: 'other@x.com' }], 'Max@Example.com'),
    ).toBe('max@example.com');
  });

  it('falls back to email identity', () => {
    expect(resolveEmailAddress([{ source: 'email', externalId: 'alder@dome.app' }])).toBe(
      'alder@dome.app',
    );
  });
});

describe('resolveSocialHandle', () => {
  it('maps provider to social_* source', () => {
    expect(
      resolveSocialHandle([{ source: 'social_x', externalId: '@dome' }], 'x'),
    ).toBe('dome');
  });
});

describe('resolveGithubAssignees', () => {
  it('dedupes logins across people', () => {
    expect(
      resolveGithubAssignees([
        { identities: [{ source: 'github', externalId: 'maxprain' }] },
        { identities: [{ source: 'github', externalId: 'MaxPrain' }] },
        { identities: [{ source: 'email', externalId: 'x@y.com' }] },
      ]),
    ).toEqual(['maxprain']);
  });
});
