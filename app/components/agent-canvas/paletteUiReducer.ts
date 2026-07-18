export type PaletteSection = 'inputs' | 'outputs' | 'systemAgents' | 'agents';

export interface PaletteUiState {
  inputsExpanded: boolean;
  outputsExpanded: boolean;
  systemAgentsExpanded: boolean;
  agentsExpanded: boolean;
}

export type PaletteUiAction =
  | { type: 'TOGGLE_SECTION'; section: PaletteSection };

export const initialPaletteUiState: PaletteUiState = {
  inputsExpanded: true,
  outputsExpanded: true,
  systemAgentsExpanded: true,
  // Collapsed by default — empty “my agents” used to dominate the palette height.
  agentsExpanded: false,
};

export function paletteUiReducer(state: PaletteUiState, action: PaletteUiAction): PaletteUiState {
  switch (action.section) {
    case 'inputs':
      return { ...state, inputsExpanded: !state.inputsExpanded };
    case 'outputs':
      return { ...state, outputsExpanded: !state.outputsExpanded };
    case 'systemAgents':
      return { ...state, systemAgentsExpanded: !state.systemAgentsExpanded };
    case 'agents':
      return { ...state, agentsExpanded: !state.agentsExpanded };
    default: {
      const _exhaustive: never = action.section;
      return _exhaustive;
    }
  }
}
