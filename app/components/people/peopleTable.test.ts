import { describe, expect, it } from 'vitest';
import {
  formatPersonDate,
  identitySourceKey,
  paginatePeople,
  personSourceKey,
  sortPeople,
  visiblePageNumbers,
} from './peopleTable';
import type { PersonSummary } from './peopleTypes';

function person(partial: Partial<PersonSummary> & { id: string; displayName: string }): PersonSummary {
  return {
    primaryEmail: null,
    avatarUrl: null,
    notes: null,
    leadStatus: 'lead',
    profile: {},
    discoveredVia: null,
    firstSeenAt: null,
    lastSeenAt: null,
    identities: [],
    ...partial,
  };
}

describe('peopleTable', () => {
  it('sorts by name and recency without using opaque ids as labels', () => {
    const people = [
      person({ id: 'p-2', displayName: 'Zoe', firstSeenAt: 10, lastSeenAt: 1 }),
      person({ id: 'p-1', displayName: 'Ana', firstSeenAt: 1, lastSeenAt: 20 }),
    ];
    expect(sortPeople(people, 'name_az').map((row) => row.displayName)).toEqual(['Ana', 'Zoe']);
    expect(sortPeople(people, 'name_za').map((row) => row.displayName)).toEqual(['Zoe', 'Ana']);
    expect(sortPeople(people, 'newest').map((row) => row.displayName)).toEqual(['Zoe', 'Ana']);
    expect(sortPeople(people, 'last_seen').map((row) => row.displayName)).toEqual(['Ana', 'Zoe']);
  });

  it('paginates and clamps the current page', () => {
    const items = Array.from({ length: 30 }, (_, index) => index + 1);
    const first = paginatePeople(items, 1, 25);
    expect(first.rows).toHaveLength(25);
    expect(first.from).toBe(1);
    expect(first.to).toBe(25);
    expect(first.totalPages).toBe(2);
    const overflow = paginatePeople(items, 99, 25);
    expect(overflow.page).toBe(2);
    expect(overflow.rows).toEqual([26, 27, 28, 29, 30]);
  });

  it('resolves a human source key instead of raw ids', () => {
    expect(
      personSourceKey(
        person({
          id: 'p-ig',
          displayName: 'Sam',
          discoveredVia: 'instagram_comment',
        }),
      ),
    ).toBe('social_instagram');
    expect(
      personSourceKey(
        person({
          id: 'p-gh',
          displayName: 'Dev',
          identities: [{ source: 'github', externalId: 'octocat' }],
        }),
      ),
    ).toBe('github');
    expect(personSourceKey(person({ id: 'p-empty', displayName: 'Nueva' }))).toBe('unknown');
    expect(identitySourceKey('social_instagram')).toBe('social_instagram');
    expect(identitySourceKey('ig')).toBe('social_instagram');
    expect(identitySourceKey('mystery')).toBe('unknown');
  });

  it('formats dates and page windows', () => {
    expect(formatPersonDate(null, 'es')).toBe('—');
    expect(formatPersonDate(Date.UTC(2023, 8, 3), 'en')).toMatch(/Sep/);
    expect(visiblePageNumbers(1, 3)).toEqual([1, 2, 3]);
    expect(visiblePageNumbers(5, 12)).toContain('ellipsis');
  });
});
