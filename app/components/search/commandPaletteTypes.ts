import type { IconSvgElement } from '@hugeicons/react';

export type PaletteKind =
  | 'nav'
  | 'action'
  | 'resource'
  | 'interaction'
  | 'person'
  | 'issue'
  | 'email'
  | 'social_post';

/** Client-side result filter chips (unified query; filter after fetch). */
export type PaletteFilter = 'all' | 'resources' | 'tasks' | 'mail' | 'people' | 'social';

interface PaletteRowBase {
  id: string;
  label: string;
  sublabel?: string;
  run: () => void;
}

export type PaletteRow =
  | (PaletteRowBase & {
      kind: 'nav';
      icon: IconSvgElement;
    })
  | (PaletteRowBase & {
      kind: 'action';
      icon: IconSvgElement;
    })
  | (PaletteRowBase & {
      kind: 'resource';
      type: string;
      /** Backing resource id for the preview pane. */
      resourceId: string;
    })
  | (PaletteRowBase & {
      kind: 'interaction';
      type: string;
      /** Backing resource id for the preview pane. */
      resourceId: string;
    })
  | (PaletteRowBase & {
      kind: 'person' | 'issue' | 'email' | 'social_post';
      icon: IconSvgElement;
      /** Source document id for preview / deep-link. */
      sourceId?: string;
      meta?: Record<string, unknown> | null;
      snippet?: string;
    });

export interface SearchResourceRow {
  id: string;
  title: string;
  type: string;
  updated_at?: number;
}

export interface SourceHitRow {
  kind: 'person' | 'issue' | 'email' | 'social_post';
  id: string;
  title: string;
  snippet?: string;
  projectId?: string;
  meta?: Record<string, unknown> | null;
}

export type PalettePreviewTarget =
  | { kind: 'resource'; resourceId: string }
  | { kind: 'source'; hit: SourceHitRow };

export function rowPassesFilter(kind: PaletteKind, filter: PaletteFilter): boolean {
  if (filter === 'all') return true;
  switch (filter) {
    case 'resources':
      return kind === 'resource' || kind === 'interaction' || kind === 'nav' || kind === 'action';
    case 'tasks':
      return kind === 'issue' || kind === 'nav' || kind === 'action';
    case 'mail':
      return kind === 'email' || kind === 'nav' || kind === 'action';
    case 'people':
      return kind === 'person' || kind === 'nav' || kind === 'action';
    case 'social':
      return kind === 'social_post' || kind === 'nav' || kind === 'action';
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

export function metaString(meta: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const v = meta?.[key];
  return typeof v === 'string' && v.trim() ? v : undefined;
}

export function metaNumber(meta: Record<string, unknown> | null | undefined, key: string): number | undefined {
  const v = meta?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export interface PaletteSearchState {
  query: string;
  resources: SearchResourceRow[];
  interactions: SearchResourceRow[];
  sources: SourceHitRow[];
  isSearching: boolean;
}

export type PaletteSearchAction =
  | { type: 'RESET' }
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SEARCH_START' }
  | {
      type: 'SEARCH_SUCCESS';
      resources: SearchResourceRow[];
      interactions: SearchResourceRow[];
      sources: SourceHitRow[];
    }
  | { type: 'SEARCH_FAIL' };

export const initialPaletteSearchState: PaletteSearchState = {
  query: '',
  resources: [],
  interactions: [],
  sources: [],
  isSearching: false,
};

export function paletteSearchReducer(
  state: PaletteSearchState,
  action: PaletteSearchAction,
): PaletteSearchState {
  switch (action.type) {
    case 'RESET':
      return initialPaletteSearchState;
    case 'SET_QUERY':
      return { ...state, query: action.query };
    case 'SEARCH_START':
      return { ...state, isSearching: true };
    case 'SEARCH_SUCCESS':
      return {
        ...state,
        resources: action.resources,
        interactions: action.interactions,
        sources: action.sources,
        isSearching: false,
      };
    case 'SEARCH_FAIL':
      return {
        ...state,
        resources: [],
        interactions: [],
        sources: [],
        isSearching: false,
      };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function sourcesByKind(sources: SourceHitRow[], kind: SourceHitRow['kind']): SourceHitRow[] {
  return sources.filter((s) => s.kind === kind);
}

export function modKeyLabel(): string {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)) {
    return '⌘K';
  }
  return 'Ctrl+K';
}

export function matchesQuery(label: string, query: string): boolean {
  return label.toLowerCase().includes(query.toLowerCase());
}
