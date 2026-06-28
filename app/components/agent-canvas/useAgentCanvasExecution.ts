import { useCallback, useEffect, useReducer } from 'react';
import type { WorkflowExecution } from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { saveExecution, getExecutionsByWorkflow } from '@/lib/agent-canvas/api';
import { generateId } from '@/lib/utils';
import { executeWorkflow, type ExecutionLogEntry } from '@/lib/agent-canvas/executor';
import { showToast } from '@/lib/store/useToastStore';
import {
  executionUiReducer,
  initialExecutionUiState,
} from './executionUiReducer';

function buildNodeOutputs() {
  return Object.fromEntries(
    Object.entries(useCanvasStore.getState().executionStates).map(([nodeId, state]) => [
      nodeId,
      {
        output: state.output,
        error: state.error,
        payload: state.payload,
      },
    ]),
  );
}

function buildExecutionRecord(
  executionId: string,
  storeSnapshot: ReturnType<typeof useCanvasStore.getState>,
  startedAt: number,
  status: 'done' | 'error',
  entries: ExecutionLogEntry[],
): WorkflowExecution {
  return {
    id: executionId,
    workflowId: storeSnapshot.activeWorkflowId!,
    workflowName: storeSnapshot.activeWorkflowName,
    startedAt,
    finishedAt: Date.now(),
    status,
    entries,
    nodeOutputs: buildNodeOutputs(),
  };
}

export function useAgentCanvasExecution(t: (key: string) => string) {
  const executionStatus = useCanvasStore((s) => s.executionStatus);
  const activeWorkflowId = useCanvasStore((s) => s.activeWorkflowId);
  const [executionUi, dispatch] = useReducer(executionUiReducer, initialExecutionUiState);

  useEffect(() => {
    if (activeWorkflowId) {
      getExecutionsByWorkflow(activeWorkflowId).then((history) => {
        dispatch({ type: 'HISTORY_LOAD', history });
      });
    } else {
      dispatch({ type: 'HISTORY_LOAD', history: [] });
    }
  }, [activeWorkflowId]);

  const handleRun = useCallback(async () => {
    if (executionStatus === 'running') return;
    const { nodes: storeNodes, edges: storeEdges } = useCanvasStore.getState();
    if (storeNodes.length === 0) {
      showToast('error', t('toast.canvas_empty'));
      return;
    }
    const executionId = generateId();
    const startedAt = Date.now();
    dispatch({ type: 'RUN_START', startedAt });
    const storeSnapshot = useCanvasStore.getState();
    const entries: ExecutionLogEntry[] = [];
    try {
      await executeWorkflow(storeNodes, storeEdges, storeSnapshot, (entry) => {
        entries.push(entry);
        dispatch({ type: 'LOG_APPEND', entry });
      });
      if (storeSnapshot.activeWorkflowId) {
        const execution = buildExecutionRecord(executionId, storeSnapshot, startedAt, 'done', entries);
        await saveExecution(execution);
        dispatch({ type: 'RUN_COMPLETE', execution });
      }
    } catch {
      if (storeSnapshot.activeWorkflowId) {
        const execution = buildExecutionRecord(executionId, storeSnapshot, startedAt, 'error', entries);
        await saveExecution(execution);
        dispatch({ type: 'RUN_COMPLETE', execution });
      }
      showToast('error', t('toast.workflow_execution_error'));
    }
  }, [executionStatus, t]);

  const selectExecution = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_EXECUTION', id });
  }, []);

  return {
    executionLog: executionUi.log,
    runStartTime: executionUi.runStartTime,
    executionHistory: executionUi.history,
    selectedExecutionId: executionUi.selectedExecutionId,
    handleRun,
    selectExecution,
  };
}
