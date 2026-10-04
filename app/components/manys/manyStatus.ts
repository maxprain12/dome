import { delegateToMany, request, type Action, type CloudMany, type ManyDetail, type Task } from '@/lib/manys/api';
import { withPaused } from './computerPermissions';

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

/**
 * Provider never writes `failed` onto a task: when a run throws, the worker pauses the task and
 * records the cause in `checkpoint.reason`. A paused task with a reason is therefore a failure.
 */
export function isFailedTask(task: Task): boolean {
  if (task.state === 'failed') return true;
  return task.state === 'paused' && Boolean(task.checkpoint?.reason);
}

/** Retrying a paused task continues it. Only a task that truly failed is sent again as a new one. */
export function retryTask(manyId: string, task: Task): Promise<unknown> {
  if (task.state === 'paused') return request(`/${manyId}/tasks/${task.id}`, 'PATCH', { action: 'resume' });
  return delegateToMany(manyId, task.prompt);
}

/**
 * Collapses a Many's detail into the single state that decides how urgently it needs the person.
 * Provider returns tasks newest first, so the latest one is `tasks[0]`.
 */
export function summarizeMany(detail: ManyDetail): ManySummary {
  const latest = detail.tasks[0] ?? null;
  const lastFailed = latest && isFailedTask(latest) ? latest : null;
  const activeTasks = detail.tasks.filter((task) => ACTIVE_STATES.includes(task.state) && task !== lastFailed);
  const decisions = detail.actions.filter((action) => action.state === 'pending' || action.state === 'outcome_unknown');
  const conflicts = detail.conflicts ?? [];
  const questions = detail.tasks.filter((task) => task.state === 'waiting_input' && task.question);

  let status: ManyStatus = 'idle';
  if (decisions.length > 0 || conflicts.length > 0 || activeTasks.some((task) => task.state === 'waiting_approval')) status = 'waiting_approval';
  else if (questions.length > 0 || activeTasks.some((task) => task.state === 'waiting_input')) status = 'waiting_input';
  else if (lastFailed) status = 'failed';
  else if (activeTasks.some((task) => task.state === 'running')) status = 'running';
  else if (activeTasks.some((task) => task.state === 'paused')) status = 'paused';
  else if (activeTasks.length > 0) status = 'queued';

  // The owner's stop outranks whatever the Many was in the middle of.
  if (detail.many.grants.paused) status = 'paused';

  return { status, activeTasks, decisions, conflicts, questions, lastFailed };
}

/** Stops a Many taking work (and fences what it is doing), or lets it work again. Nothing else about it changes. */
export function setManyPaused(many: CloudMany, paused: boolean): Promise<unknown> {
  return request(`/${many.id}`, 'PATCH', { name: many.name, instructions: many.instructions, grants: withPaused(many.grants, paused) });
}
