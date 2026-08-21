import type { PersonDetail, PersonIdentity, PersonSummary } from './peopleTypes';

export type InstagramLeadInfo = {
  handle: string | null;
  name: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
  biography: string | null;
  website: string | null;
  followersCount: number | null;
  mediaCount: number | null;
  identity: PersonIdentity | null;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

export function isInstagramLead(
  person: Pick<PersonSummary, 'discoveredVia' | 'identities' | 'profile' | 'displayName'>,
): boolean {
  if (person.discoveredVia === 'instagram_comment') return true;
  if ((person.identities ?? []).some((i) => i.source === 'social_instagram')) return true;
  const profile = person.profile && typeof person.profile === 'object' ? person.profile : {};
  if (typeof profile.instagram_username === 'string' && profile.instagram_username.trim()) {
    return true;
  }
  return false;
}

export function resolveInstagramLead(person: PersonDetail | PersonSummary): InstagramLeadInfo | null {
  if (!isInstagramLead(person)) return null;
  const identity =
    (person.identities ?? []).find((i) => i.source === 'social_instagram') ?? null;
  const meta = identity?.meta && typeof identity.meta === 'object' ? identity.meta : {};
  const profile = person.profile && typeof person.profile === 'object' ? person.profile : {};

  const displayHandle = asString(person.displayName)?.startsWith('@')
    ? asString(person.displayName)?.replace(/^@/, '') || null
    : null;
  const handle =
    asString(meta.username) ||
    asString(profile.instagram_username) ||
    asString(identity?.displayLabel)?.replace(/^@/, '') ||
    displayHandle ||
    null;
  const profileUrl =
    asString(meta.profile_url) ||
    asString(profile.instagram_url) ||
    (handle && !/^\d+$/.test(handle)
      ? `https://www.instagram.com/${encodeURIComponent(handle)}/`
      : null);
  const avatarUrl =
    asString(person.avatarUrl) ||
    asString(profile.instagram_avatar) ||
    asString(meta.profile_picture_url) ||
    null;

  return {
    handle,
    name: asString(meta.name) || asString(profile.instagram_name) || null,
    profileUrl,
    avatarUrl,
    biography: asString(meta.biography) || asString(profile.instagram_bio) || null,
    website: asString(meta.website) || asString(profile.website) || null,
    followersCount:
      asNumber(meta.followers_count) ?? asNumber(profile.instagram_followers),
    mediaCount: asNumber(meta.media_count) ?? asNumber(profile.instagram_media_count),
    identity,
  };
}

export function formatFollowerCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(count);
}
