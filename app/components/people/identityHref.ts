import { looksLikeOpaqueId } from '@/lib/social/socialQueues';
import type { PersonIdentity } from './peopleTypes';

type MetaObject = Record<string, unknown>;
type HrefBuilder = (identity: PersonIdentity, meta: MetaObject | null) => string | null;

function readMetaObject(identity: PersonIdentity): MetaObject | null {
  return identity.meta && typeof identity.meta === 'object' ? (identity.meta as MetaObject) : null;
}

function readMetaProfileUrl(meta: MetaObject | null): string | null {
  return meta && typeof meta.profile_url === 'string' ? meta.profile_url : null;
}

function buildInstagramHref(identity: PersonIdentity, meta: MetaObject | null): string | null {
  const handle = String(meta?.username || identity.displayLabel || identity.externalId || '')
    .replace(/^@/, '')
    .trim();
  if (!handle || /^\d+$/.test(handle)) return null;
  return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
}

function buildEmailHref(identity: PersonIdentity): string | null {
  if (!identity.externalId.includes('@')) return null;
  return `mailto:${identity.externalId}`;
}

function buildGithubHref(identity: PersonIdentity): string | null {
  const login = String(identity.displayLabel || identity.externalId).replace(/^@/, '');
  if (!login) return null;
  return `https://github.com/${encodeURIComponent(login)}`;
}

function buildWebsiteHref(identity: PersonIdentity): string | null {
  const raw = identity.externalId.trim();
  if (!raw) return null;
  return /:\/\//.test(raw) ? raw : `https://${raw}`;
}

function buildPhoneHref(identity: PersonIdentity): string | null {
  const tel = identity.externalId.replace(/[^\d+]/g, '');
  return tel ? `tel:${tel}` : null;
}

const SOURCE_HREF_BUILDERS: Record<string, HrefBuilder> = {
  social_instagram: buildInstagramHref,
  email: (identity) => buildEmailHref(identity),
  github: (identity) => buildGithubHref(identity),
  website: (identity) => buildWebsiteHref(identity),
  phone: (identity) => buildPhoneHref(identity),
};

/** External URL / mailto / tel for a linked identity, or null if none. */
export function identityHref(identity: PersonIdentity): string | null {
  const meta = readMetaObject(identity);
  const fromMeta = readMetaProfileUrl(meta);
  if (fromMeta) return fromMeta;
  const builder = SOURCE_HREF_BUILDERS[identity.source];
  return builder ? builder(identity, meta) : null;
}

/** Human label for an identity — never a raw UUID or opaque id. */
export function identityLabel(identity: PersonIdentity): string {
  const raw = (identity.displayLabel ?? '').trim();
  if (raw && !looksLikeOpaqueId(raw)) return raw;
  const ext = (identity.externalId ?? '').trim();
  if (ext && !looksLikeOpaqueId(ext)) return ext;
  const source = identity.source.replace(/_/g, ' ').trim();
  return source || '—';
}
