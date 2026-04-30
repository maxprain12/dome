/**
 * Local search UX signals for future reranking (LTR) and recommendations.
 * See docs/features/search-telemetry.md for the event contract.
 */

import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { capturePostHog } from '@/lib/analytics/posthog';

const STORAGE_KEY = 'dome:search:selection-buffer-v1';
const BUFFER_MAX = 50;

export type SearchSurface = 'cmdk_modal' | 'inline_home';

export interface SearchResultSelectionPayload {
  surface: SearchSurface;
  query: string;
  /** Selected entity id (resource id, or studio output id in inline search). */
  selectedId: string;
  /** 1-based rank in the visible result list for this query. */
  rank1Indexed: number;
  /** Inline search section when applicable. */
  category?: string;
}

function readBuffer(): SearchResultSelectionPayload[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SearchResultSelectionPayload[]) : [];
  } catch {
    return [];
  }
}

function writeBuffer(entries: SearchResultSelectionPayload[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-BUFFER_MAX)));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Called when the user opens a row from Cmd+K or the home inline search.
 * Buffers locally; sends PostHog when configured.
 */
export function recordSearchResultSelected(payload: SearchResultSelectionPayload): void {
  const prev = readBuffer();
  prev.push({
    ...payload,
    query: payload.query.slice(0, 500),
  });
  writeBuffer(prev);

  capturePostHog(ANALYTICS_EVENTS.SEARCH_RESULT_SELECTED, {
    surface: payload.surface,
    query_len: payload.query.length,
    rank: payload.rank1Indexed,
    category: payload.category ?? null,
  });
}

export function peekRecentSearchSelections(max = 10): SearchResultSelectionPayload[] {
  return readBuffer().slice(-max);
}
