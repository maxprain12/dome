import { looksLikeOpaqueId } from '@/lib/social/socialQueues';
import type { PersonIdentity } from './peopleTypes';

/** External URL / mailto / tel for a linked identity, or null if none. */
export function identityHref(identity: PersonIdentity): string | null {
  const meta = identity.meta && typeof identity.meta === 'object' ? identity.meta : null;
  const fromMeta = meta && typeof meta.profile_url === 'string' ? meta.profile_url : null;
  if (fromMeta) return fromMeta;
  if (identity.source === 'social_instagram') {
    const handle = String(meta?.username || identity.displayLabel || identity.externalId || '')
      .replace(/^@/, '')
      .trim();
    if (handle && !/^\d+$/.test(handle)) return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
  }
  if (identity.source === 'email' && identity.externalId.includes('@')) {
    return `mailto:${identity.externalId}`;
  }
  if (identity.source === 'github') {
    const login = String(identity.displayLabel || identity.externalId).replace(/^@/, '');
    if (login) return `https://github.com/${encodeURIComponent(login)}`;
  }
  if (identity.source === 'website') {
    const raw = identity.externalId.trim();
    if (!raw) return null;
    return /:\/\//.test(raw) ? raw : `https://${raw}`;
  }
  if (identity.source === 'phone') {
    const tel = identity.externalId.replace(/[^\d+]/g, '');
    return tel ? `tel:${tel}` : null;
  }
  return null;
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
