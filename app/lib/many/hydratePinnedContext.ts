/**
 * Prefetch pinned entities so Many's agent turn always has readable context
 * (chip-only pins no longer put ids in the composer text).
 */

import type { PinnedResource } from '@/lib/store/useManyStore';

const BODY_MAX = 2000;

export type EnrichedPinnedSource = {
  kind: 'issue' | 'email' | 'social_post' | 'social_campaign';
  id: string;
  title: string;
  meta: Record<string, unknown> | null;
};

export type EnrichedPinnedPerson = {
  id: string;
  title: string;
  identities?: PinnedResource['identities'];
  meta?: Record<string, unknown> | null;
};

export type EnrichedPinnedDoc = {
  id: string;
  title: string;
  type: string;
  meta?: Record<string, unknown> | null;
};

export type HydratedPinnedContext = {
  people: EnrichedPinnedPerson[];
  sources: EnrichedPinnedSource[];
  docs: EnrichedPinnedDoc[];
  /** Blocks appended to the agent user message (not shown in the UI bubble). */
  agentBlocks: string[];
};

function clip(text: string, max = BODY_MAX): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

async function hydrateSocialPost(pin: PinnedResource): Promise<EnrichedPinnedSource> {
  const baseMeta = { ...(pin.meta ?? {}) };
  try {
    const res = await window.electron?.invoke?.('social:posts:get', { postId: pin.id });
    const post = res?.success ? res.data : null;
    const row = asRecord(post);
    if (!row) {
      return { kind: 'social_post', id: pin.id, title: pin.title, meta: baseMeta };
    }
    const body = typeof row.body === 'string' ? clip(row.body) : '';
    return {
      kind: 'social_post',
      id: pin.id,
      title: pin.title,
      meta: {
        ...baseMeta,
        provider: row.provider ?? baseMeta.provider,
        status: row.status ?? baseMeta.status,
        campaign: row.campaign ?? baseMeta.campaign,
        ...(body ? { body } : {}),
      },
    };
  } catch {
    return { kind: 'social_post', id: pin.id, title: pin.title, meta: baseMeta };
  }
}

async function hydrateSocialCampaign(pin: PinnedResource): Promise<EnrichedPinnedSource> {
  const baseMeta = { ...(pin.meta ?? {}) };
  try {
    const res = await window.electron?.invoke?.('social:campaigns:list');
    const list = res?.success && Array.isArray(res.data) ? res.data : [];
    const hit = list.find((c: { id?: string }) => c?.id === pin.id) as
      | { id?: string; name?: string; goal?: string | null }
      | undefined;
    return {
      kind: 'social_campaign',
      id: pin.id,
      title: hit?.name || pin.title,
      meta: {
        ...baseMeta,
        campaign: hit?.name || baseMeta.campaign || pin.title,
        campaignId: pin.id,
        goal: hit?.goal ?? baseMeta.goal ?? null,
      },
    };
  } catch {
    return {
      kind: 'social_campaign',
      id: pin.id,
      title: pin.title,
      meta: { ...baseMeta, campaignId: pin.id },
    };
  }
}

async function hydrateEmail(pin: PinnedResource): Promise<EnrichedPinnedSource> {
  const baseMeta = { ...(pin.meta ?? {}) };
  const messageId =
    (typeof baseMeta.uid === 'string' && baseMeta.uid) ||
    pin.id;
  try {
    const read = window.electron?.email?.read;
    if (!read) {
      return { kind: 'email', id: pin.id, title: pin.title, meta: baseMeta };
    }
    const res = await read({
      messageId,
      folder: typeof baseMeta.folder === 'string' ? baseMeta.folder : undefined,
    });
    if (!res?.success || !res.message) {
      return { kind: 'email', id: pin.id, title: pin.title, meta: baseMeta };
    }
    const msg = asRecord(res.message) || {};
    const body =
      clip(String(msg.text || msg.body || msg.html || '').replace(/<[^>]+>/g, ' ')) || '';
    return {
      kind: 'email',
      id: pin.id,
      title: pin.title,
      meta: {
        ...baseMeta,
        folder: msg.folder ?? baseMeta.folder,
        from: msg.from ?? baseMeta.from,
        subject: msg.subject ?? pin.title,
        ...(body ? { body } : {}),
      },
    };
  } catch {
    return { kind: 'email', id: pin.id, title: pin.title, meta: baseMeta };
  }
}

async function hydrateIssue(pin: PinnedResource): Promise<EnrichedPinnedSource> {
  const baseMeta = { ...(pin.meta ?? {}) };
  try {
    const res = await window.electron?.github?.issues?.get?.(pin.id);
    const issue = res?.success ? res.issue : null;
    const row = asRecord(issue);
    if (!row) {
      return { kind: 'issue', id: pin.id, title: pin.title, meta: baseMeta };
    }
    const body = typeof row.body === 'string' ? clip(row.body) : '';
    return {
      kind: 'issue',
      id: pin.id,
      title: pin.title,
      meta: {
        ...baseMeta,
        fullName: baseMeta.fullName,
        state: row.state ?? baseMeta.state,
        number: row.number ?? baseMeta.number,
        html_url: row.html_url ?? baseMeta.html_url,
        ...(body ? { body } : {}),
      },
    };
  } catch {
    return { kind: 'issue', id: pin.id, title: pin.title, meta: baseMeta };
  }
}

async function hydratePerson(pin: PinnedResource): Promise<EnrichedPinnedPerson> {
  try {
    const res = await window.electron?.people?.get?.(pin.id);
    const person = res?.success ? res.data?.person : null;
    const row = asRecord(person);
    if (!row) {
      return {
        id: pin.id,
        title: pin.title,
        identities: pin.identities,
        meta: pin.meta ?? null,
      };
    }
    const identities =
      (Array.isArray(row.identities) ? row.identities : pin.identities) || [];
    return {
      id: pin.id,
      title: String(row.displayName || pin.title),
      identities: identities as PinnedResource['identities'],
      meta: {
        primaryEmail: row.primaryEmail ?? null,
        notes: typeof row.notes === 'string' ? clip(row.notes, 500) : null,
      },
    };
  } catch {
    return {
      id: pin.id,
      title: pin.title,
      identities: pin.identities,
      meta: pin.meta ?? null,
    };
  }
}

async function hydrateDoc(pin: PinnedResource): Promise<EnrichedPinnedDoc> {
  // Content is fetched in-loop via resource_get_pinned (needs runtime allowlist).
  return {
    id: pin.id,
    title: pin.title,
    type: pin.type || 'resource',
    meta: pin.meta ?? null,
  };
}

function blockForSource(src: EnrichedPinnedSource): string {
  const meta = src.meta || {};
  const body = typeof meta.body === 'string' ? meta.body : '';

  if (src.kind === 'social_post') {
    return [
      `### Pinned social_post ${src.id} — ${src.title}`,
      `provider: ${meta.provider ?? 'unknown'}`,
      `status: ${meta.status ?? 'unknown'}`,
      'body:',
      body || '(unavailable — call social_post_get)',
      '',
      `Call social_post_get with post_id=${src.id} if you need the full record or metrics.`,
    ].join('\n');
  }

  if (src.kind === 'social_campaign') {
    return [
      `### Pinned social_campaign ${src.id} — ${src.title}`,
      `goal: ${meta.goal ?? '(none)'}`,
      '',
      'Use social_posts_list / social_metrics_summary filtered by this campaign; do not call social_post_get with the campaign id.',
    ].join('\n');
  }

  if (src.kind === 'email') {
    return [
      `### Pinned email ${src.id} — ${src.title}`,
      `folder: ${meta.folder ?? 'INBOX'}`,
      `from: ${meta.from ?? '(unknown)'}`,
      'body:',
      body || '(unavailable — call email_read)',
      '',
      `Call email_read with message_id=${meta.uid || src.id}` +
        (meta.folder ? ` folder=${meta.folder}` : '') +
        '.',
    ].join('\n');
  }

  // issue
  return [
    `### Pinned issue ${src.id} — ${src.title}`,
    `state: ${meta.state ?? 'unknown'}`,
    typeof meta.fullName === 'string' ? `repo: ${meta.fullName}` : null,
    'body:',
    body || '(unavailable — call github_get_issue)',
    '',
    `Call github_get_issue with issue_id=${src.id}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function blockForPerson(person: EnrichedPinnedPerson): string {
  const identities = (person.identities || [])
    .map((i) => `${i.source}:${i.displayLabel || i.externalId}`)
    .join(', ');
  const notes =
    typeof person.meta?.notes === 'string' && person.meta.notes
      ? `\nnotes: ${person.meta.notes}`
      : '';
  return [
    `### Pinned person ${person.id} — ${person.title}`,
    identities ? `identities: ${identities}` : null,
    person.meta?.primaryEmail ? `email: ${person.meta.primaryEmail}` : null,
    notes.trim() || null,
    '',
    `Call people_get with person_id=${person.id} for the full profile.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function blockForDoc(doc: EnrichedPinnedDoc): string {
  return [
    `### Pinned resource ${doc.id} — ${doc.title} (${doc.type})`,
    `This library document is pinned. Call resource_get_pinned with id=${doc.id} before answering about its contents.`,
  ].join('\n');
}

/** Prefetch all pinned entities for the next Many agent turn. */
export async function hydratePinnedContext(
  pinned: PinnedResource[],
): Promise<HydratedPinnedContext> {
  const peoplePins = pinned.filter((r) => r.kind === 'person');
  const campaignPins = pinned.filter((r) => r.type === 'social_campaign');
  const sourcePins = pinned.filter(
    (r) =>
      (r.kind === 'issue' || r.kind === 'email' || r.kind === 'social_post') &&
      r.type !== 'social_campaign',
  );
  const docPins = pinned.filter(
    (r) =>
      r.type !== 'social_campaign' &&
      r.kind !== 'person' &&
      r.kind !== 'issue' &&
      r.kind !== 'email' &&
      r.kind !== 'social_post',
  );

  const [people, sources, campaigns, docs] = await Promise.all([
    Promise.all(peoplePins.map(hydratePerson)),
    Promise.all(sourcePins.map((pin) => {
      if (pin.kind === 'email') return hydrateEmail(pin);
      if (pin.kind === 'issue') return hydrateIssue(pin);
      return hydrateSocialPost(pin);
    })),
    Promise.all(campaignPins.map(hydrateSocialCampaign)),
    Promise.all(docPins.map(hydrateDoc)),
  ]);

  const allSources = [...sources, ...campaigns];
  const agentBlocks = [
    ...allSources.map(blockForSource),
    ...people.map(blockForPerson),
    ...docs.map(blockForDoc),
  ];

  return { people, sources: allSources, docs, agentBlocks };
}
