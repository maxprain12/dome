import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { statusLabel as runStatusLabel, statusColor as runStatusColor } from '@/lib/automations/run-status';

export interface DomeStatusBadgeProps {
  status: string;
  className?: string;
}

/**
 * Badge de estado de ejecución (runs / automatizaciones), colores desde `RunLogView`.
 */
export default function DomeStatusBadge({ status, className }: DomeStatusBadgeProps) {
  const color = runStatusColor(status);
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${className ?? ''}`}
      style={{
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        color,
      }}
    >
      {status === 'running' && <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden />}
      {status === 'queued' && <Clock className="w-2.5 h-2.5" aria-hidden />}
      {status === 'waiting_approval' && <Clock className="w-2.5 h-2.5" aria-hidden />}
      {status === 'completed' && <CheckCircle2 className="w-2.5 h-2.5" aria-hidden />}
      {status === 'failed' && <XCircle className="w-2.5 h-2.5" aria-hidden />}
      {status === 'cancelled' && <XCircle className="w-2.5 h-2.5" aria-hidden />}
      {runStatusLabel(status)}
    </span>
  );
}
