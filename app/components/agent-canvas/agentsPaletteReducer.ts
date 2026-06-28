import type { ManyAgent } from '@/types';

export interface AgentsPaletteState {
  agents: ManyAgent[];
  agentQuery: string;
  loadingAgents: boolean;
}

export type AgentsPaletteAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; agents: ManyAgent[] }
  | { type: 'LOAD_FAIL' }
  | { type: 'SET_QUERY'; query: string };

export const initialAgentsPaletteState: AgentsPaletteState = {
  agents: [],
  agentQuery: '',
  loadingAgents: false,
};

export function agentsPaletteReducer(
  state: AgentsPaletteState,
  action: AgentsPaletteAction,
): AgentsPaletteState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loadingAgents: true };
    case 'LOAD_SUCCESS':
      return { ...state, agents: action.agents, loadingAgents: false };
    case 'LOAD_FAIL':
      return { ...state, agents: [], loadingAgents: false };
    case 'SET_QUERY':
      return { ...state, agentQuery: action.query };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
