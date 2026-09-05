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
};

function clip(text: string, max = BODY_MAX): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function metaString(meta: Record<string, unknown>, key: string): string | undefined {
  const value = meta[key];
  if (typeof value === 'string' && value.trim()) return value;
  return undefined;
}

/** IMAP uid (string or number from SQLite) wins; otherwise the pin id (`emsg-…`). */
export function buildPinnedEmailReadArgs(pin: PinnedResource): {
  messageId: string;
  folder?: string;
  accountId?: string;
} {
  const meta = { ...(pin.meta ?? {}) };
  const uid = meta.uid;
  const fromUid = uid != null && String(uid).trim() !== '' ? String(uid) : '';
  const args: { messageId: string; folder?: string; accountId?: string } = {
    messageId: fromUid || pin.id,
  };
  const folder = metaString(meta, 'folder');
  if (folder) args.folder = folder;
  const accountId = metaString(meta, 'accountId');
  if (accountId) args.accountId = accountId;
  return args;
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
  const readArgs = buildPinnedEmailReadArgs(pin);
  try {
    const read = window.electron?.email?.read;
    if (!read) {
      console.warn('[hydratePinnedContext] email.read unavailable', pin.title);
      return { kind: 'email', id: pin.id, title: pin.title, meta: baseMeta };
    }
    const res = await read(readArgs);
    if (!res?.success || !res.message) {
      console.warn(
        '[hydratePinnedContext] email.read failed:',
        res?.error || 'no message',
        pin.title,
      );
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
  } catch (err) {
    const message = err instanceof Error ? err.message : err;
    console.warn('[hydratePinnedContext] email.read error:', message, pin.title);
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
  return { people, sources: allSources, docs };
}
