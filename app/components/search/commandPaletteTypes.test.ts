import { describe, expect, it } from 'vitest';
import {
  initialPaletteSearchState,
  matchesQuery,
  paletteSearchReducer,
} from './commandPaletteTypes';

describe('command palette model', () => {
  it('normalizes case while matching destinations', () => {
    expect(matchesQuery('Proyectos recientes', 'PROYECTOS')).toBe(true);
    expect(matchesQuery('Calendario', 'correo')).toBe(false);
  });

  it('replaces stale results after a successful search and resets cleanly', () => {
    const searching = paletteSearchReducer(initialPaletteSearchState, { type: 'SEARCH_START' });
    const populated = paletteSearchReducer(searching, {
      type: 'SEARCH_SUCCESS',
      resources: [{ id: 'resource-1', title: 'Plan', type: 'note' }],
      interactions: [{ id: 'resource-2', title: 'Comentario', type: 'pdf' }],
      sources: [{ kind: 'issue', id: 'iss-1', title: '#1 Bug' }],
    });

    expect(populated.isSearching).toBe(false);
    expect(populated.resources).toHaveLength(1);
    expect(populated.sources).toHaveLength(1);
    expect(paletteSearchReducer(populated, { type: 'RESET' })).toEqual(initialPaletteSearchState);
  });
});
