import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { ManyAgent } from '@/types';
import { getManyAgents } from '@/lib/agents/api';
import {
  agentsPaletteReducer,
  initialAgentsPaletteState,
} from './agentsPaletteReducer';

export function useCanvasSidebarAgents(hubProjectId: string) {
  const [state, dispatch] = useReducer(agentsPaletteReducer, initialAgentsPaletteState);

  const loadAgents = useCallback(async () => {
    dispatch({ type: 'LOAD_START' });
    try {
      const result = await getManyAgents(hubProjectId);
      dispatch({ type: 'LOAD_SUCCESS', agents: result });
    } catch (err) {
      console.error('[CanvasSidebar] loadAgents failed:', err);
      dispatch({ type: 'LOAD_FAIL' });
    }
  }, [hubProjectId]);

  useEffect(() => {
    void loadAgents();
    const handler = () => void loadAgents();
    window.addEventListener('dome:agents-changed', handler);
    return () => window.removeEventListener('dome:agents-changed', handler);
  }, [loadAgents]);

  const filteredAgents = useMemo(() => {
    const q = state.agentQuery.trim().toLowerCase();
    if (!q) return state.agents;
    return state.agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description && a.description.toLowerCase().includes(q)),
    );
  }, [state.agents, state.agentQuery]);

  const setAgentQuery = useCallback((query: string) => {
    dispatch({ type: 'SET_QUERY', query });
  }, []);

  return {
    agents: state.agents,
    agentQuery: state.agentQuery,
    loadingAgents: state.loadingAgents,
    filteredAgents,
    loadAgents,
    setAgentQuery,
  };
}

export type { ManyAgent };
