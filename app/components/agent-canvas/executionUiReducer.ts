import type { WorkflowExecution } from '@/types/canvas';
import type { ExecutionLogEntry } from '@/lib/agent-canvas/executor';

export interface ExecutionUiState {
  log: ExecutionLogEntry[];
  runStartTime: number | null;
  history: WorkflowExecution[];
  selectedExecutionId: string | null;
}

export type ExecutionUiAction =
  | { type: 'RUN_START'; startedAt: number }
  | { type: 'LOG_APPEND'; entry: ExecutionLogEntry }
  | { type: 'RUN_COMPLETE'; execution: WorkflowExecution }
  | { type: 'HISTORY_LOAD'; history: WorkflowExecution[] }
  | { type: 'SELECT_EXECUTION'; id: string | null };

export const initialExecutionUiState: ExecutionUiState = {
  log: [],
  runStartTime: null,
  history: [],
  selectedExecutionId: null,
};

export function executionUiReducer(state: ExecutionUiState, action: ExecutionUiAction): ExecutionUiState {
  switch (action.type) {
    case 'RUN_START':
      return {
        ...state,
        log: [],
        runStartTime: action.startedAt,
        selectedExecutionId: null,
      };
    case 'LOG_APPEND':
      return { ...state, log: [...state.log, action.entry] };
    case 'RUN_COMPLETE':
      return { ...state, history: [action.execution, ...state.history] };
    case 'HISTORY_LOAD':
      return { ...state, history: action.history, selectedExecutionId: null };
    case 'SELECT_EXECUTION':
      return { ...state, selectedExecutionId: action.id };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
