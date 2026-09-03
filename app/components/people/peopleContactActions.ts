import { looksLikeOpaqueId } from '@/lib/social/socialQueues';
import { identityHref, identityLabel } from './identityHref';
import { coreProfileValue } from './personProfileFields';
import type { PersonIdentity, PersonSummary } from './peopleTypes';

const SOCIAL_SOURCES = new Set(['social_instagram', 'github']);

export function trimmedProfileField(
  profile: Record<string, unknown> | undefined,
  key: 'occupation' | 'phone' | 'website',
): string | null {
  const raw = profile?.[key];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

export function personPhone(
  person: Pick<PersonSummary, 'profile' | 'identities'>,
): string | null {
  const fromProfile = trimmedProfileField(person.profile, 'phone');
  if (fromProfile) return fromProfile;
  const phoneId = (person.identities ?? []).find((identity) => identity.source === 'phone');
  if (!phoneId) return null;
  const label = identityLabel(phoneId);
  if (label && label !== '—') return label;
  const ext = phoneId.externalId.trim();
  return ext || null;
}

export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const tel = phone.replace(/[^\d+]/g, '');
  return tel ? `tel:${tel}` : null;
}

export function personWebsiteHref(
  person: Pick<PersonSummary, 'profile' | 'identities'>,
): string | null {
  const website = trimmedProfileField(person.profile, 'website');
  if (website) return /:\/\//.test(website) ? website : `https://${website}`;
  const identity = (person.identities ?? []).find((item) => item.source === 'website');
  return identity ? identityHref(identity) : null;
}

export function looksLikeSocialPostId(id: string): boolean {
  return /^sp-[0-9a-f]{6,}$/i.test(id.trim());
}

export type PersonSocialAction =
  | { kind: 'href'; href: string }
  | { kind: 'native_post'; postId: string };

export function personSocialAction(
  identities: PersonIdentity[] | undefined,
): PersonSocialAction | null {
  for (const identity of identities ?? []) {
    if (!SOCIAL_SOURCES.has(identity.source)) continue;
    if (looksLikeSocialPostId(identity.externalId)) {
      return { kind: 'native_post', postId: identity.externalId.trim() };
    }
    const href = identityHref(identity);
    if (!href) continue;
    const handle = String(identity.displayLabel || identity.externalId || '').replace(/^@/, '').trim();
    if (looksLikeOpaqueId(handle)) continue;
    return { kind: 'href', href };
  }
  return null;
}

export function personDirectorySubtitle(
  person: Pick<PersonSummary, 'profile' | 'primaryEmail'>,
  igHandle?: string | null,
): string | null {
  const occupation = coreProfileValue(person.profile, 'occupation').trim();
  if (occupation) return occupation;
  const handle = (igHandle ?? '').replace(/^@/, '').trim();
  if (handle) return `@${handle}`;
  const email = person.primaryEmail?.trim();
  return email || null;
}

export function openExternalHref(href: string): void {
  const win = globalThis.window;
  if (!win) return;
  win.open(href, '_blank', 'noopener,noreferrer');
}
