/**
 * Resolve people identities for agent tools (GitHub assignees, email to, social handles).
 */

export type PersonIdentityLike = {
  source: string;
  externalId: string;
  displayLabel?: string | null;
};

function stripAt(value: string): string {
  return value.replace(/^@/, '').trim();
}

export function resolveGithubLogin(
  identities: PersonIdentityLike[] | undefined | null,
): string | null {
  if (!identities?.length) return null;
  const hit = identities.find((i) => i.source === 'github');
  if (!hit) return null;
  const login = stripAt(hit.displayLabel || hit.externalId);
  return login || null;
}

export function resolveEmailAddress(
  identities: PersonIdentityLike[] | undefined | null,
  primaryEmail?: string | null,
): string | null {
  if (primaryEmail && primaryEmail.includes('@')) {
    return primaryEmail.trim().toLowerCase();
  }
  if (!identities?.length) return null;
  const hit = identities.find((i) => i.source === 'email');
  if (!hit) return null;
  const addr = (hit.displayLabel || hit.externalId).trim().toLowerCase();
  return addr.includes('@') ? addr : null;
}

export type SocialProvider = 'x' | 'linkedin' | 'instagram';

const SOCIAL_SOURCE: Record<SocialProvider, string> = {
  x: 'social_x',
  linkedin: 'social_linkedin',
  instagram: 'social_instagram',
};

export function resolveSocialHandle(
  identities: PersonIdentityLike[] | undefined | null,
  provider: SocialProvider,
): string | null {
  if (!identities?.length) return null;
  const source = SOCIAL_SOURCE[provider];
  const hit = identities.find((i) => i.source === source);
  if (!hit) return null;
  const handle = stripAt(hit.displayLabel || hit.externalId);
  return handle || null;
}

/** Collect github logins from one or more people (for issue assignees). */
export function resolveGithubAssignees(
  people: Array<{ identities?: PersonIdentityLike[] | null }>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const person of people) {
    const login = resolveGithubLogin(person.identities);
    if (!login) continue;
    const key = login.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(login);
  }
  return out;
}
