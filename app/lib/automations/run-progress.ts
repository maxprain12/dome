import type { PersistentRun } from './api';

export interface RunProgressSnapshot {
  mode: 'determinate' | 'indeterminate';
  completed?: number;
  total?: number;
  percent?: number;
}

function readProgressRecord(run: PersistentRun): Record<string, unknown> | null {
  const progress = run.metadata?.progress;
  return progress && typeof progress === 'object' ? (progress as Record<string, unknown>) : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

export function getRunProgress(run: PersistentRun): RunProgressSnapshot | null {
  const progress = readProgressRecord(run);
  if (progress) {
    const completed = toFiniteNumber(progress.completed);
    const total = toFiniteNumber(progress.total);
    const percent = toFiniteNumber(progress.percent);

    if (completed !== null && total !== null && total > 0) {
      const normalizedPercent =
        percent !== null
          ? Math.max(0, Math.min(100, Math.round(percent)))
          : Math.round((completed / total) * 100);

      return {
        mode: 'determinate',
        completed,
        total,
        percent: normalizedPercent,
      };
    }
  }

  if (run.status === 'running' || run.status === 'queued') {
    return { mode: 'indeterminate' };
  }

  return null;
}
