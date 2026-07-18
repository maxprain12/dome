import {
  CheckmarkCircle02Icon as CheckCircle2Icon,
  Clock01Icon as ClockIcon,
  Loading03Icon as Loader2Icon,
  CancelCircleIcon as XCircleIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Badge } from '@/components/ui/badge';
import { statusLabel as runStatusLabel } from '@/lib/automations/run-status';
import { cn } from '@/lib/utils';

export interface RunStatusBadgeProps {
  status: string;
  className?: string;
}

/** Badge de estado de runs (dominio automations) sobre el Badge shadcn. */
export default function RunStatusBadge({ status, className }: RunStatusBadgeProps) {
  const variant = status === 'failed' || status === 'cancelled'
    ? 'destructive'
    : status === 'running'
      ? 'default'
      : 'secondary';
  return (
    <Badge
      variant={variant}
      className={cn('h-auto gap-1 px-1.5 py-0.5 text-[10px] font-semibold', className)}
    >
      {status === 'running' && <HugeiconsIcon icon={Loader2Icon} className="size-2.5 animate-spin" aria-hidden />}
      {(status === 'queued' || status === 'waiting_approval') && <HugeiconsIcon icon={ClockIcon} className="size-2.5" aria-hidden />}
      {status === 'completed' && <HugeiconsIcon icon={CheckCircle2Icon} className="size-2.5" aria-hidden />}
      {(status === 'failed' || status === 'cancelled') && <HugeiconsIcon icon={XCircleIcon} className="size-2.5" aria-hidden />}
      {runStatusLabel(status)}
    </Badge>
  );
}
