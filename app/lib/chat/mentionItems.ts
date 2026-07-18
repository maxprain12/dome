/**
 * Unified @-mention ranking helpers (people → tasks/mail/posts → resources).
 */

import {
  formatEmailPinLabel,
  formatIssuePinLabel,
  formatPersonPinLabel,
  formatResourcePinLabel,
  formatSocialPostPinLabel,
} from '@/lib/chat/pinLabels';

export type MentionIdentity = {
  source: string;
  externalId: string;
  displayLabel?: string | null;
};

export type MentionItemKind = 'person' | 'resource' | 'issue' | 'email' | 'social_post';

export interface MentionItem {
  kind: MentionItemKind;
  id: string;
  title: string;
  /** Resource type, or domain label for non-resources. */
  type: string;
  identities?: MentionIdentity[];
  subtitle?: string;
  meta?: Record<string, unknown> | null;
}

const IDENTITY_SOURCE_LABEL: Record<string, string> = {
  github: 'GitHub',
  email: 'email',
  social_x: 'X',
  social_linkedin: 'LinkedIn',
  social_instagram: 'Instagram',
  manual: 'manual',
};

export function formatIdentitySubtitle(identities: MentionIdentity[] | undefined): string {
  if (!identities || identities.length === 0) return 'person';
  return identities
    .slice(0, 3)
    .map((identity) => {
      const source = IDENTITY_SOURCE_LABEL[identity.source] || identity.source;
      const handle = identity.displayLabel || identity.externalId;
      return `${source}:${handle}`;
    })
    .join(' · ');
}

export function personToMentionItem(person: {
  id: string;
  displayName: string;
  primaryEmail?: string | null;
  identities?: Array<{
    source: string;
    externalId: string;
    displayLabel?: string | null;
  }>;
}): MentionItem {
  const identities: MentionIdentity[] = (person.identities || []).map((identity) => ({
    source: identity.source,
    externalId: identity.externalId,
    displayLabel: identity.displayLabel ?? null,
  }));
  return {
    kind: 'person',
    id: person.id,
    title: formatPersonPinLabel(person.displayName, person.primaryEmail),
    type: 'person',
    identities,
    subtitle: formatIdentitySubtitle(identities),
  };
}

export function resourceToMentionItem(row: {
  id: string;
  title: string;
  type: string;
}): MentionItem | null {
  if (row.type === 'folder') return null;
  return {
    kind: 'resource',
    id: row.id,
    title: formatResourcePinLabel(row.title),
    type: row.type,
    subtitle: row.type,
  };
}

export function sourceHitToMentionItem(hit: {
  kind: 'person' | 'issue' | 'email' | 'social_post';
  id: string;
  title: string;
  snippet?: string;
  meta?: Record<string, unknown> | null;
}): MentionItem {
  if (hit.kind === 'person') {
    const identities = (hit.meta?.identities as MentionIdentity[] | undefined) || [];
    return {
      kind: 'person',
      id: hit.id,
      title: formatPersonPinLabel(hit.title),
      type: 'person',
      identities,
      subtitle: formatIdentitySubtitle(identities) || hit.snippet || 'person',
      meta: hit.meta ?? null,
    };
  }
  if (hit.kind === 'issue') {
    const repo = typeof hit.meta?.fullName === 'string' ? hit.meta.fullName : undefined;
    const state = hit.meta?.state === 'closed' ? 'done' : 'open';
    return {
      kind: 'issue',
      id: hit.id,
      title: formatIssuePinLabel(hit.title),
      type: 'issue',
      subtitle: [state, repo].filter(Boolean).join(' · ') || 'task',
      meta: hit.meta ?? null,
    };
  }
  if (hit.kind === 'email') {
    const folder = typeof hit.meta?.folder === 'string' ? hit.meta.folder : undefined;
    return {
      kind: 'email',
      id: hit.id,
      title: formatEmailPinLabel(hit.title),
      type: 'email',
      subtitle: folder || hit.snippet || 'mail',
      meta: hit.meta ?? null,
    };
  }
  const provider = typeof hit.meta?.provider === 'string' ? hit.meta.provider : null;
  const status = typeof hit.meta?.status === 'string' ? hit.meta.status : null;
  const campaign =
    typeof hit.meta?.campaign === 'string'
      ? hit.meta.campaign
      : typeof hit.meta?.campaignName === 'string'
        ? hit.meta.campaignName
        : null;
  const title = formatSocialPostPinLabel({
    provider,
    status,
    campaign,
    fallbackTitle: hit.title,
  });
  return {
    kind: 'social_post',
    id: hit.id,
    title,
    type: 'social_post',
    subtitle: hit.snippet || provider || 'post',
    meta: hit.meta ?? null,
  };
}

/**
 * Prefer people, then integration sources, then resources. Dedupes by `kind:id`.
 */
export function mergeMentionResults(
  buckets: MentionItem[][],
  limit = 25,
): MentionItem[] {
  const seen = new Set<string>();
  const out: MentionItem[] = [];
  for (const bucket of buckets) {
    for (const item of bucket) {
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Text inserted at the caret when picking an @ mention.
 * People / tasks / mail / social are chip-only (pin + context) — no raw
 * `[@label](scheme:id)` in the composer. Library resources keep a short `@title`.
 */
export function mentionInsertionText(item: MentionItem): string {
  switch (item.kind) {
    case 'person':
    case 'issue':
    case 'email':
    case 'social_post':
      return '';
    case 'resource':
      return `@${item.title} `;
    default: {
      const _exhaustive: never = item.kind;
      return _exhaustive;
    }
  }
}

/** True when the mention is represented only by a pin chip (not composer text). */
export function isChipOnlyMention(kind: MentionItemKind): boolean {
  return kind === 'person' || kind === 'issue' || kind === 'email' || kind === 'social_post';
}
