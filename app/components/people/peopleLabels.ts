import type { LeadStatus } from './peopleTypes';

/**
 * Readable label for a person row — prefers displayName, never falls back to a raw id.
 * `displayName` is required at creation time (see people-store.cjs upsertPerson), so an
 * empty value here would indicate corrupted data rather than a normal state.
 */
export function personDisplayLabel(person: { displayName?: string | null } | null | undefined): string {
  const name = (person?.displayName ?? '').trim();
  return name || '—';
}

export function personInitial(person: { displayName?: string | null } | null | undefined): string {
  const name = (person?.displayName ?? '').trim();
  return name ? name.charAt(0).toUpperCase() : '?';
}

const LEAD_STATUS_BADGE_VARIANT: Record<LeadStatus, 'secondary' | 'lime' | 'outline'> = {
  lead: 'secondary',
  customer: 'lime',
  archived: 'outline',
};

export function leadStatusBadgeVariant(status?: string | null): 'secondary' | 'lime' | 'outline' {
  return LEAD_STATUS_BADGE_VARIANT[(status as LeadStatus) ?? 'lead'] ?? 'secondary';
}
