import type { ExecutionLogEntry } from '@/lib/agent-canvas/executor';
import type { CanvasExecutionStatus } from '@/lib/store/useCanvasStore';
import type { WorkflowExecution } from '@/types/canvas';

export function resolveExecutionDisplay(
  entries: ExecutionLogEntry[],
  status: CanvasExecutionStatus,
  startTime: number | null,
  history: WorkflowExecution[],
  selectedExecutionId: string | null,
) {
  const selectedExecution = selectedExecutionId
    ? history.find((e) => e.id === selectedExecutionId) ?? null
    : null;
  const displayEntries =
    status === 'running' ? entries : selectedExecution?.entries ?? entries;
  const displayStartTime = selectedExecution?.startedAt ?? startTime;
  const displayStatus = selectedExecution?.status ?? status;
  return { selectedExecution, displayEntries, displayStartTime, displayStatus };
}

export function hasExecutionLogContent(
  status: CanvasExecutionStatus,
  entries: ExecutionLogEntry[],
  history: WorkflowExecution[],
) {
  return status === 'running' || entries.length > 0 || history.length > 0;
}

export function countAgentProgress(displayEntries: ExecutionLogEntry[]) {
  const completedAgents = displayEntries.filter((e) => e.type === 'done').length;
  const totalAgents = new Set(displayEntries.map((e) => e.nodeId)).size;
  return { completedAgents, totalAgents };
}

type StatusPresentation = {
  isRunning: boolean;
  isDone: boolean;
  isError: boolean;
  statusColor: string;
  statusLabelKey:
    | 'canvas.exec_status_running'
    | 'canvas.exec_status_done'
    | 'canvas.exec_status_error'
    | 'canvas.exec_status_idle';
};

export function getExecutionStatusPresentation(
  displayStatus: CanvasExecutionStatus,
): StatusPresentation {
  const isRunning = displayStatus === 'running';
  const isDone = displayStatus === 'done';
  const isError = displayStatus === 'error';
  let statusColor = 'var(--muted-foreground)';
  let statusLabelKey: StatusPresentation['statusLabelKey'] = 'canvas.exec_status_idle';

  if (isRunning) {
    statusColor = 'var(--primary)';
    statusLabelKey = 'canvas.exec_status_running';
  } else if (isDone) {
    statusColor = 'var(--success)';
    statusLabelKey = 'canvas.exec_status_done';
  } else if (isError) {
    statusColor = 'var(--destructive)';
    statusLabelKey = 'canvas.exec_status_error';
  }

  return { isRunning, isDone, isError, statusColor, statusLabelKey };
}

export function buildHistorySelectOptions(
  history: WorkflowExecution[],
  timeLocale: string,
  formatElapsedFromRange: (start: number, end?: number) => string,
  currentRunLabel: string,
) {
  return [
    { value: '', label: currentRunLabel },
    ...history.map((ex) => ({
      value: ex.id,
      label: `${new Date(ex.startedAt).toLocaleTimeString(timeLocale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })} (${ex.status}) ${ex.finishedAt ? formatElapsedFromRange(ex.startedAt, ex.finishedAt) : ''}`,
    })),
  ];
}
