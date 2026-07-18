import type { TFunction } from 'i18next';
import { useEffect, useReducer } from 'react';
import { orderUnifiedResourcesByHybrid } from '@/lib/search/hybrid-search';
import {
  initialPaletteSearchState,
  paletteSearchReducer,
  type SourceHitRow,
} from './commandPaletteTypes';

function mapSources(raw: unknown): SourceHitRow[] {
  if (!Array.isArray(raw)) return [];
  const out: SourceHitRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const kind = row.kind;
    if (kind !== 'person' && kind !== 'issue' && kind !== 'email' && kind !== 'social_post') {
      continue;
    }
    if (typeof row.id !== 'string' || typeof row.title !== 'string') continue;
    out.push({
      kind,
      id: row.id,
      title: row.title,
      snippet: typeof row.snippet === 'string' ? row.snippet : undefined,
      projectId: typeof row.projectId === 'string' ? row.projectId : undefined,
      meta: (row.meta as Record<string, unknown> | null | undefined) ?? null,
    });
  }
  return out.slice(0, 20);
}

export function useCommandPaletteSearch(
  isOpen: boolean,
  projectId: string,
  t: TFunction,
) {
  const [searchState, dispatch] = useReducer(paletteSearchReducer, initialPaletteSearchState);
  const trimmedQuery = searchState.query.trim();

  useEffect(() => {
    if (!isOpen || !trimmedQuery) {
      dispatch({ type: 'SEARCH_SUCCESS', resources: [], interactions: [], sources: [] });
      return;
    }

    let ignore = false;
    const timer = window.setTimeout(async () => {
      dispatch({ type: 'SEARCH_START' });
      try {
        if (!window.electron?.db?.search?.unified) return;
        const result = await window.electron.db.search.unified(trimmedQuery, projectId);
        if (ignore || !result.success || !result.data) return;

        let resources: typeof searchState.resources = [];
        if (Array.isArray(result.data.resources) && result.data.resources.length > 0) {
          const ordered = await orderUnifiedResourcesByHybrid(trimmedQuery, result.data.resources, {
            mergeTake: 12,
          });
          resources = ordered.slice(0, 8).map((r) => ({
            id: r.id,
            title: r.title || t('folder.untitled', 'Sin título'),
            type: r.type || 'note',
            updated_at: r.updated_at,
          }));
        }

        let interactions: typeof searchState.interactions = [];
        if (Array.isArray(result.data.interactions) && result.data.interactions.length > 0) {
          interactions = result.data.interactions.slice(0, 4).map((i: {
            id: string;
            type?: string;
            resource_id?: string;
            resource_title?: string;
            updated_at?: number;
            created_at?: number;
          }) => ({
            id: i.resource_id || i.id,
            title: i.resource_title || t('folder.untitled', 'Sin título'),
            type: i.type || 'note',
            updated_at: i.updated_at ?? i.created_at,
          }));
        }

        const sources = mapSources(
          (result.data as { sources?: unknown }).sources,
        );

        if (!ignore) {
          dispatch({ type: 'SEARCH_SUCCESS', resources, interactions, sources });
        }
      } catch (err) {
        console.error('[CommandPalette] search failed:', err);
        if (!ignore) dispatch({ type: 'SEARCH_FAIL' });
      }
    }, 200);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, trimmedQuery, projectId, t]);

  return {
    searchState,
    trimmedQuery,
    setQuery: (query: string) => dispatch({ type: 'SET_QUERY', query }),
    resetSearch: () => dispatch({ type: 'RESET' }),
  };
}
