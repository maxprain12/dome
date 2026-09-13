import { coreProfileValue } from './personProfileFields';
import { personDisplayLabel } from './peopleLabels';
import type { PersonSummary } from './peopleTypes';

export const PEOPLE_PAGE_SIZES = [25, 50, 100] as const;

export type PeopleSort = 'name_az' | 'name_za' | 'newest' | 'last_seen';
export type PeoplePageSize = (typeof PEOPLE_PAGE_SIZES)[number];

export const SOURCE_KEYS = [
  'manual',
  'email',
  'github',
  'website',
  'phone',
  'document',
  'calendar',
  'company',
  'social_instagram',
  'social_linkedin',
  'social_x',
  'social_facebook',
  'social_tiktok',
  'social_youtube',
] as const;

export type PersonSourceKey = (typeof SOURCE_KEYS)[number] | 'unknown';

const SOURCE_ALIASES: Record<string, PersonSourceKey> = {
  manual: 'manual',
  email: 'email',
  github: 'github',
  website: 'website',
  phone: 'phone',
  document: 'document',
  calendar: 'calendar',
  company: 'company',
  social_instagram: 'social_instagram',
  instagram: 'social_instagram',
  ig: 'social_instagram',
  instagram_comment: 'social_instagram',
  social_linkedin: 'social_linkedin',
  linkedin: 'social_linkedin',
  social_x: 'social_x',
  twitter: 'social_x',
  x: 'social_x',
  social_facebook: 'social_facebook',
  facebook: 'social_facebook',
  social_tiktok: 'social_tiktok',
  tiktok: 'social_tiktok',
  social_youtube: 'social_youtube',
  youtube: 'social_youtube',
};

function asSourceKey(raw: string | null | undefined): PersonSourceKey | null {
  if (!raw) return null;
  const key = SOURCE_ALIASES[raw.trim().toLowerCase()];
  return key ?? null;
}

export function identitySourceKey(source: string | null | undefined): PersonSourceKey {
  return asSourceKey(source) ?? 'unknown';
}

export function personSourceKey(person: PersonSummary): PersonSourceKey {
  const fromDiscovery = asSourceKey(person.discoveredVia);
  if (fromDiscovery) return fromDiscovery;
  for (const identity of person.identities ?? []) {
    const fromIdentity = asSourceKey(identity.source);
    if (fromIdentity) return fromIdentity;
  }
  return 'unknown';
}

export function personCompany(person: PersonSummary): string {
  return coreProfileValue(person.profile, 'company').trim();
}

export function formatPersonDate(ts: number | null | undefined, locale: string): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function compareTimestamps(a: number | null | undefined, b: number | null | undefined): number {
  const av = a ?? 0;
  const bv = b ?? 0;
  return av - bv;
}

export function sortPeople(people: PersonSummary[], sort: PeopleSort): PersonSummary[] {
  const next = [...people];
  next.sort((a, b) => {
    if (sort === 'newest') return compareTimestamps(b.firstSeenAt, a.firstSeenAt);
    if (sort === 'last_seen') return compareTimestamps(b.lastSeenAt, a.lastSeenAt);
    const cmp = personDisplayLabel(a).localeCompare(personDisplayLabel(b), undefined, {
      sensitivity: 'base',
    });
    return sort === 'name_za' ? -cmp : cmp;
  });
  return next;
}

export function paginatePeople<T>(
  items: T[],
  page: number,
  pageSize: PeoplePageSize,
): { rows: T[]; page: number; totalPages: number; from: number; to: number; total: number } {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const rows = items.slice(start, start + pageSize);
  const from = total === 0 ? 0 : start + 1;
  const to = start + rows.length;
  return { rows, page: safePage, totalPages, from, to, total };
}

export function visiblePageNumbers(page: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = Array.from(pages)
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);
  const out: Array<number | 'ellipsis'> = [];
  for (const value of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === 'number' && value - prev > 1) out.push('ellipsis');
    out.push(value);
  }
  return out;
}
