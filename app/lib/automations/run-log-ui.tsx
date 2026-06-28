import DomeProgressBar from '@/components/ui/DomeProgressBar';
import type { PersistentRun } from '@/lib/automations/api';
import { getRunProgress } from '@/lib/automations/run-progress';
import { statusLabel } from '@/lib/automations/run-status';

export function RunProgressBar({ run }: { run: PersistentRun }) {
  const progress = getRunProgress(run);
  if (!progress) return null;

  if (progress.mode === 'determinate') {
    return (
      <DomeProgressBar
        value={progress.percent ?? 0}
        max={100}
        size="sm"
        aria-label={statusLabel(run.status)}
      />
    );
  }

  return <DomeProgressBar indeterminate size="sm" aria-label={statusLabel(run.status)} />;
}
