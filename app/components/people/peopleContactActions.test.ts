import { describe, expect, it } from 'vitest';
import {
  looksLikeSocialPostId,
  personDirectorySubtitle,
  personPhone,
  personSocialAction,
  personWebsiteHref,
  telHref,
} from './peopleContactActions';

describe('peopleContactActions', () => {
  it('prefers occupation, then IG handle, then email for the list subtitle', () => {
    expect(
      personDirectorySubtitle({ profile: { occupation: 'Founder' }, primaryEmail: 'a@b.com' }, 'max'),
    ).toBe('Founder');
    expect(personDirectorySubtitle({ profile: {}, primaryEmail: 'a@b.com' }, '@max')).toBe('@max');
    expect(personDirectorySubtitle({ profile: {}, primaryEmail: 'a@b.com' })).toBe('a@b.com');
    expect(personDirectorySubtitle({ profile: {} })).toBeNull();
  });

  it('resolves phone from profile or phone identity, never a raw person id', () => {
    expect(personPhone({ profile: { phone: '+34 600 000' } })).toBe('+34 600 000');
    expect(
      personPhone({
        profile: {},
        identities: [{ source: 'phone', externalId: '+34600111222', displayLabel: 'Móvil' }],
      }),
    ).toBe('Móvil');
    expect(telHref('+34 600 000')).toBe('tel:+34600000');
    expect(telHref(null)).toBeNull();
  });

  it('builds a website href from profile or website identity', () => {
    expect(personWebsiteHref({ profile: { website: 'dome.app' } })).toBe('https://dome.app');
    expect(
      personWebsiteHref({
        profile: {},
        identities: [{ source: 'website', externalId: 'https://example.com' }],
      }),
    ).toBe('https://example.com');
  });

  it('opens native social posts only when the id is a post, not a person', () => {
    expect(looksLikeSocialPostId('sp-ab12cd34ef')).toBe(true);
    expect(looksLikeSocialPostId('person-uuid-looking')).toBe(false);
    expect(
      personSocialAction([
        { source: 'social_instagram', externalId: 'sp-ab12cd34ef', displayLabel: 'draft' },
      ]),
    ).toEqual({ kind: 'native_post', postId: 'sp-ab12cd34ef' });
    expect(
      personSocialAction([{ source: 'social_instagram', externalId: 'maxprain', displayLabel: '@maxprain' }]),
    ).toEqual({ kind: 'href', href: 'https://www.instagram.com/maxprain/' });
    expect(
      personSocialAction([
        { source: 'social_instagram', externalId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
      ]),
    ).toBeNull();
  });
});
