import type { Action, ManyDetail, Task } from '@/lib/manys/api';

export type ManyStatus = 'idle' | 'queued' | 'running' | 'paused' | 'waiting_input' | 'waiting_approval' | 'failed';

export const STATUS_DOT: Record<ManyStatus, string> = {
  idle: 'bg-success',
  queued: 'bg-muted-foreground',
  running: 'bg-success',
  paused: 'bg-warning',
  waiting_input: 'bg-warning',
  waiting_approval: 'bg-warning',
  failed: 'bg-destructive',
};

const ACTIVE_STATES = ['queued', 'running', 'paused', 'waiting_input', 'waiting_approval'];

export function statusLabelKey(status: ManyStatus): string {
  return status === 'idle' ? 'manys.idle' : `manys.states.${status}`;
}

export interface ManySummary {
  status: ManyStatus;
  activeTasks: Task[];
  decisions: Action[];
  conflicts: ManyDetail['conflicts'];
  questions: Task[];
  lastFailed: Task | null;
}

/** Collapses a Many's detail into the single state that decides how urgently it needs the person. */
export function summarizeMany(detail: ManyDetail): ManySummary {
  const activeTasks = detail.tasks.filter((task) => ACTIVE_STATES.includes(task.state));
  const decisions = detail.actions.filter((action) => action.state === 'pending' || action.state === 'outcome_unknown');
  const conflicts = detail.conflicts ?? [];
  const questions = detail.tasks.filter((task) => task.question);
  const last = detail.tasks[detail.tasks.length - 1];
  const lastFailed = last?.state === 'failed' ? last : null;

  let status: ManyStatus = 'idle';
  if (decisions.length > 0 || conflicts.length > 0 || activeTasks.some((task) => task.state === 'waiting_approval')) status = 'waiting_approval';
  else if (questions.length > 0 || activeTasks.some((task) => task.state === 'waiting_input')) status = 'waiting_input';
  else if (activeTasks.some((task) => task.state === 'running')) status = 'running';
  else if (activeTasks.some((task) => task.state === 'paused')) status = 'paused';
  else if (activeTasks.length > 0) status = 'queued';
  else if (lastFailed) status = 'failed';

  return { status, activeTasks, decisions, conflicts, questions, lastFailed };
}
