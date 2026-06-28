import type { ReactNode } from 'react';

export type PaletteKind = 'nav' | 'action' | 'resource' | 'interaction';

export interface PaletteRow {
  id: string;
  kind: PaletteKind;
  label: string;
  sublabel?: string;
  type?: string;
  icon: ReactNode;
  run: () => void;
}

export interface SearchResourceRow {
  id: string;
  title: string;
  type: string;
  updated_at?: number;
}

export interface PaletteSearchState {
  query: string;
  resources: SearchResourceRow[];
  interactions: SearchResourceRow[];
  isSearching: boolean;
}

export type PaletteSearchAction =
  | { type: 'RESET' }
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SEARCH_START' }
  | { type: 'SEARCH_SUCCESS'; resources: SearchResourceRow[]; interactions: SearchResourceRow[] }
  | { type: 'SEARCH_FAIL' };

export const initialPaletteSearchState: PaletteSearchState = {
  query: '',
  resources: [],
  interactions: [],
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
        isSearching: false,
      };
    case 'SEARCH_FAIL':
      return { ...state, resources: [], interactions: [], isSearching: false };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
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
