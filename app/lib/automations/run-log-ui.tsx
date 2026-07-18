import { Progress } from '@/components/ui/progress';
import type { PersistentRun } from '@/lib/automations/api';
import { getRunProgress } from '@/lib/automations/run-progress';
import { statusLabel } from '@/lib/automations/run-status';

export function RunProgressBar({ run }: { run: PersistentRun }) {
  const progress = getRunProgress(run);
  if (!progress) return null;

  if (progress.mode === 'determinate') {
    return (
      <Progress
        value={progress.percent ?? 0}
        className="h-1.5"
        aria-label={statusLabel(run.status)}
      />
    );
  }

  return <Progress value={null} className="h-1.5" aria-label={statusLabel(run.status)} />;
}
