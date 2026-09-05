/**
 * Short, stable labels for pinned / @-mentioned entities in Many.
 * Never put post bodies, email bodies, or long prose in the pin title or
 * composer token — those belong in tool fetches / snippets.
 */

import type { PinnedResource } from '@/lib/store/useManyStore';

const PROVIDER_LABEL: Record<string, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  x: 'X',
  twitter: 'X',
};

const MAX_GENERIC = 48;
const MAX_SOCIAL_PART = 28;

export function truncatePinLabel(text: string, max = MAX_GENERIC): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, Math.max(1, max - 1))}…`;
}

export function socialProviderLabel(provider: string | null | undefined): string {
  if (!provider) return 'Social';
  const key = String(provider).toLowerCase();
  return PROVIDER_LABEL[key] || truncatePinLabel(String(provider), 16);
}

export function formatSocialPostPinLabel(opts: {
  provider?: string | null;
  status?: string | null;
  campaign?: string | null;
  fallbackTitle?: string | null;
}): string {
  const provider = socialProviderLabel(opts.provider);
  const campaign = truncatePinLabel(String(opts.campaign || ''), MAX_SOCIAL_PART);
  if (campaign) return `${provider} · ${campaign}`;

  const status = truncatePinLabel(String(opts.status || ''), 20);
  if (status) return `${provider} · ${status}`;

  const fallback = truncatePinLabel(String(opts.fallbackTitle || ''), MAX_SOCIAL_PART);
  // Reject leftover body dumps used as titles.
  if (fallback && fallback.length <= MAX_SOCIAL_PART && !looksLikeProseDump(fallback)) {
    return fallback;
  }
  return `${provider} · post`;
}

function looksLikeProseDump(text: string): boolean {
  // Our labels use "Provider · status"; long multi-word strings without · are body.
  if (text.includes(' · ')) return false;
  const words = text.trim().split(/\s+/);
  return words.length >= 6 || text.length > 40;
}

export function formatEmailPinLabel(subject: string | null | undefined): string {
  return truncatePinLabel(subject || 'Email', MAX_GENERIC) || 'Email';
}

function optionalMetaString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

export function toEmailPin(input: {
  title: string;
  uid?: string | number | null;
  dbId?: string | null;
  folder?: string | null;
  accountId?: string | null;
}): PinnedResource {
  const uid = optionalMetaString(input.uid);
  const dbId =
    typeof input.dbId === 'string' && input.dbId.startsWith('emsg-') ? input.dbId : undefined;
  const folder = optionalMetaString(input.folder);
  const accountId = optionalMetaString(input.accountId);
  const id = dbId || uid || 'email-unknown';
  const meta: Record<string, unknown> = {};
  if (uid) meta.uid = uid;
  if (folder) meta.folder = folder;
  if (accountId) meta.accountId = accountId;
  if (dbId) meta.dbId = dbId;
  return {
    id,
    title: formatEmailPinLabel(input.title),
    type: 'email',
    kind: 'email',
    meta: Object.keys(meta).length > 0 ? meta : null,
  };
}

function emailFolderKey(meta: Record<string, unknown> | null | undefined): string {
  const folder = optionalMetaString(meta?.folder);
  return folder || 'INBOX';
}

export function emailPinsMatch(
  a: Pick<PinnedResource, 'id' | 'kind' | 'type' | 'meta'>,
  b: Pick<PinnedResource, 'id' | 'kind' | 'type' | 'meta'>,
): boolean {
  const aEmail = a.kind === 'email' || a.type === 'email';
  const bEmail = b.kind === 'email' || b.type === 'email';
  if (!aEmail || !bEmail) return false;
  if (a.id && a.id === b.id) return true;
  const aMeta = a.meta ?? {};
  const bMeta = b.meta ?? {};
  const aDb = optionalMetaString(aMeta.dbId);
  const bDb = optionalMetaString(bMeta.dbId);
  if (aDb && bDb && aDb === bDb) return true;
  const aUid = optionalMetaString(aMeta.uid);
  const bUid = optionalMetaString(bMeta.uid);
  const aAccount = optionalMetaString(aMeta.accountId);
  const bAccount = optionalMetaString(bMeta.accountId);
  if (aUid && bUid && aUid === bUid && aAccount && bAccount && aAccount === bAccount) {
    return emailFolderKey(aMeta) === emailFolderKey(bMeta);
  }
  return false;
}

export function formatIssuePinLabel(title: string | null | undefined): string {
  return truncatePinLabel(title || 'Issue', MAX_GENERIC) || 'Issue';
}

export function formatResourcePinLabel(title: string | null | undefined): string {
  return truncatePinLabel(title || 'Untitled', MAX_GENERIC) || 'Untitled';
}

export function formatPersonPinLabel(
  name: string | null | undefined,
  email?: string | null,
): string {
  return truncatePinLabel(name || email || 'Person', MAX_GENERIC) || 'Person';
}

const MENTION_SCHEMES = ['person', 'issue', 'email', 'social'] as const;

/** Remove typed `[@label](scheme:id)` tokens for pins already shown as chips. */
export function stripPinnedMentionTokens(
  content: string,
  pins: Array<{ id: string }>,
): string {
  if (!content || pins.length === 0) return content;
  let out = content;
  for (const pin of pins) {
    const id = pin.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const scheme of MENTION_SCHEMES) {
      out = out.replace(new RegExp(`\\[@[^\\]]*\\]\\(${scheme}:${id}\\)`, 'g'), '');
    }
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

/** Pick a non-empty campaign name from meta or fall back to the given default. */
function pickCampaignName(
  meta: Record<string, unknown> | null,
  fallback: string | undefined,
): string {
  if (typeof meta?.campaign === 'string' && meta.campaign) return meta.campaign;
  if (typeof meta?.campaignName === 'string' && meta.campaignName) return meta.campaignName;
  return fallback ?? '';
}

/** Build the inputs for formatSocialPostPinLabel from a resource's meta. */
function socialPostLabelInputs(
  resource: PinnedResource,
  meta: Record<string, unknown> | null,
): Parameters<typeof formatSocialPostPinLabel>[0] {
  return {
    provider: typeof meta?.provider === 'string' ? meta.provider : null,
    status: typeof meta?.status === 'string' ? meta.status : null,
    campaign:
      typeof meta?.campaign === 'string'
        ? meta.campaign
        : typeof meta?.campaignName === 'string'
          ? meta.campaignName
          : null,
    fallbackTitle: resource.title,
  };
}

/** Normalize a pin at the store boundary so every call site stays clean. */
export function normalizePinnedResource(resource: PinnedResource): PinnedResource {
  const kind = resource.kind ?? (resource.type === 'person' ? 'person' : 'resource');
  const meta = resource.meta ?? null;

  // Campaign pins are named entities — keep the campaign name (not coerced to a post).
  if (resource.type === 'social_campaign') {
    return {
      ...resource,
      // Keep type social_campaign; kind stays social_post only for chip icon affinity.
      kind: 'social_post',
      type: 'social_campaign',
      title: formatResourcePinLabel(pickCampaignName(meta, resource.title)),
      meta,
    };
  }

  if (kind === 'social_post' || resource.type === 'social_post') {
    return {
      ...resource,
      kind: 'social_post',
      title: formatSocialPostPinLabel(socialPostLabelInputs(resource, meta)),
      meta,
    };
  }

  if (kind === 'email' || resource.type === 'email') {
    return {
      ...resource,
      kind: 'email',
      title: formatEmailPinLabel(resource.title),
      meta,
    };
  }

  if (kind === 'issue' || resource.type === 'issue') {
    return {
      ...resource,
      kind: 'issue',
      title: formatIssuePinLabel(resource.title),
      meta,
    };
  }

  if (kind === 'person' || resource.type === 'person') {
    return {
      ...resource,
      kind: 'person',
      title: formatPersonPinLabel(resource.title),
      meta,
    };
  }

  return {
    ...resource,
    kind: kind === 'resource' ? 'resource' : resource.kind,
    title: formatResourcePinLabel(resource.title),
    meta,
  };
}
