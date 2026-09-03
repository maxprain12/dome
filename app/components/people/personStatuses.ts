import { looksLikeOpaqueId } from '@/lib/social/socialQueues';

export const BUILTIN_PERSON_STATUSES = [
  'lead',
  'prospect',
  'qualified',
  'customer',
  'partner',
  'vendor',
  'investor',
  'colleague',
  'personal',
  'archived',
] as const;

export type BuiltinPersonStatus = (typeof BUILTIN_PERSON_STATUSES)[number];

export type CustomPersonStatus = { id: string; label: string };

export const CUSTOM_PERSON_STATUSES_KEY = 'people_custom_statuses';

const RESERVED = new Set(['all', '']);

export function isBuiltinPersonStatus(id: string): id is BuiltinPersonStatus {
  return (BUILTIN_PERSON_STATUSES as readonly string[]).includes(id);
}

function isOpaqueStatusToken(value: string): boolean {
  if (looksLikeOpaqueId(value)) return true;
  return looksLikeOpaqueId(value.replace(/_/g, '-'));
}

export function normalizePersonStatus(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || isOpaqueStatusToken(trimmed)) return null;
  const slug = trimmed
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  if (!slug || RESERVED.has(slug) || isOpaqueStatusToken(slug)) return null;
  return slug;
}

export function slugifyPersonStatusLabel(label: string): string | null {
  return normalizePersonStatus(label);
}

export function humanizePersonStatus(id: string): string {
  const slug = id.trim();
  if (!slug || looksLikeOpaqueId(slug)) return '—';
  return slug
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function parseCustomStatuses(raw: string | null | undefined): CustomPersonStatus[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: CustomPersonStatus[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const id = normalizePersonStatus((item as { id?: unknown }).id as string);
      const label = String((item as { label?: unknown }).label ?? '').trim();
      if (!id || isBuiltinPersonStatus(id) || looksLikeOpaqueId(label)) continue;
      const safeLabel = label && !looksLikeOpaqueId(label) ? label : humanizePersonStatus(id);
      if (out.some((row) => row.id === id)) continue;
      out.push({ id, label: safeLabel });
    }
    out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    return out;
  } catch {
    return [];
  }
}

export function personStatusLabel(
  id: string | null | undefined,
  t: (key: string, opts?: { defaultValue?: string }) => string,
  customs: CustomPersonStatus[] = [],
): string {
  const slug = normalizePersonStatus(id) || 'lead';
  const custom = customs.find((row) => row.id === slug);
  if (custom) return custom.label;
  if (isBuiltinPersonStatus(slug)) return t(`people.lead_status_${slug}`);
  return t(`people.lead_status_${slug}`, { defaultValue: humanizePersonStatus(slug) });
}

const BADGE_VARIANT: Record<BuiltinPersonStatus, 'secondary' | 'lime' | 'outline'> = {
  lead: 'secondary',
  prospect: 'secondary',
  qualified: 'secondary',
  customer: 'lime',
  partner: 'secondary',
  vendor: 'outline',
  investor: 'secondary',
  colleague: 'secondary',
  personal: 'outline',
  archived: 'outline',
};

export function leadStatusBadgeVariant(status?: string | null): 'secondary' | 'lime' | 'outline' {
  const slug = normalizePersonStatus(status) || 'lead';
  if (isBuiltinPersonStatus(slug)) return BADGE_VARIANT[slug];
  return 'secondary';
}
