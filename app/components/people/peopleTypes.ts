/**
 * Shared types for the People hub (list + detail + timeline).
 * Mirrors the `window.electron.people` IPC contract (see app/types/global.d.ts).
 */

export type LeadStatus = 'lead' | 'customer' | 'archived';

export interface PersonIdentity {
  source: string;
  externalId: string;
  displayLabel?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface PersonInteraction {
  id: string;
  kind: string;
  refType?: string | null;
  refId?: string | null;
  summary?: string | null;
  occurredAt: number;
  payload?: Record<string, unknown>;
}

/** Row shape returned by `people.list` / `people.search` (no interactions, no profile in search). */
export interface PersonSummary {
  id: string;
  displayName: string;
  primaryEmail?: string | null;
  avatarUrl?: string | null;
  notes?: string | null;
  leadStatus?: string;
  profile?: Record<string, unknown>;
  discoveredVia?: string | null;
  firstSeenAt?: number | null;
  lastSeenAt?: number | null;
  identities?: PersonIdentity[];
}

/** Full shape returned by `people.get`. */
export interface PersonDetail {
  id: string;
  displayName: string;
  primaryEmail?: string | null;
  avatarUrl?: string | null;
  notes?: string | null;
  leadStatus?: string;
  profile?: Record<string, unknown>;
  discoveredVia?: string | null;
  identities?: PersonIdentity[];
  interactions?: PersonInteraction[];
}

export const LEAD_STATUSES: LeadStatus[] = ['lead', 'customer', 'archived'];

export type PeopleFilter = 'all' | LeadStatus;
