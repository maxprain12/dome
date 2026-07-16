/**
 * Unified @-mention ranking helpers (people preferred, then resources).
 */

export type MentionIdentity = {
  source: string;
  externalId: string;
  displayLabel?: string | null;
};

export type MentionItemKind = 'person' | 'resource';

export interface MentionItem {
  kind: MentionItemKind;
  id: string;
  title: string;
  /** Resource type, or `"person"` for people. */
  type: string;
  identities?: MentionIdentity[];
  subtitle?: string;
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
    title: person.displayName || person.primaryEmail || 'Person',
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
    title: row.title || 'Untitled',
    type: row.type,
    subtitle: row.type,
  };
}

/**
 * People first (exact / prefix identity hits already ranked by store),
 * then resources. Dedupes by id. Caps total length.
 */
export function mergeMentionResults(
  people: MentionItem[],
  resources: MentionItem[],
  limit = 25,
): MentionItem[] {
  const seen = new Set<string>();
  const out: MentionItem[] = [];
  for (const item of [...people, ...resources]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** Serialize a mention into the composer text at the caret. */
export function mentionInsertionText(item: MentionItem): string {
  if (item.kind === 'person') {
    const label = item.title.replace(/[\[\]]/g, '');
    return `[@${label}](person:${item.id}) `;
  }
  return `@${item.title} `;
}
