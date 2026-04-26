import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Circle, Loader2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PersistentRunStep } from '@/lib/automations/api';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface AgentRunTimelineProps {
  steps: PersistentRunStep[];
  className?: string;
}

function statusIcon(step: PersistentRunStep) {
  switch (step.status) {
    case 'running':
    case 'queued':
    case 'pending':
    case 'waiting_approval':
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" aria-hidden />;
    case 'completed':
    case 'done':
      return <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden />;
    case 'failed':
    case 'error':
    case 'cancelled':
      return <XCircle className="h-3.5 w-3.5 text-[var(--error)]" aria-hidden />;
    default: {
      const exhaustive: never = step.status;
      void exhaustive;
      return <Circle className="h-3.5 w-3.5 text-[var(--tertiary-text)]" aria-hidden />;
    }
  }
}

function statusLabelKey(status: PersistentRunStep['status']): string {
  switch (status) {
    case 'pending':
    case 'queued':
      return 'chat.run_step_pending';
    case 'running':
      return 'chat.run_step_running';
    case 'waiting_approval':
      return 'chat.run_step_waiting_approval';
    case 'completed':
    case 'done':
      return 'chat.run_step_completed';
    case 'failed':
    case 'error':
      return 'chat.run_step_failed';
    case 'cancelled':
      return 'chat.run_step_cancelled';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export default function AgentRunTimeline({ steps, className }: AgentRunTimelineProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const visibleSteps = useMemo(() => (expanded ? steps : steps.slice(-4)), [expanded, steps]);
  if (steps.length === 0) return null;

  return (
    <div className={cn('ai-surface-card w-full p-2', className)}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        aria-expanded={expanded}
      >
        <ChevronRight
          className={cn('h-3.5 w-3.5 text-[var(--tertiary-text)] transition-transform', expanded && 'rotate-90')}
          aria-hidden
        />
        <span className="text-[12px] font-semibold text-[var(--secondary-text)]">
          {t('chat.agent_timeline_title', { count: steps.length })}
        </span>
      </button>
      <div className="mt-1.5 flex flex-col gap-1">
        {visibleSteps.map((step) => (
          <div key={step.id} className="grid grid-cols-[16px_1fr_auto] items-start gap-2 rounded-lg px-2 py-1.5">
            <div className="mt-0.5">{statusIcon(step)}</div>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-[var(--primary-text)]">{step.title}</div>
              <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-[var(--tertiary-text)]">
                <span>{t(statusLabelKey(step.status))}</span>
                <span>{step.stepType}</span>
              </div>
              {expanded && step.content ? (
                <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-[var(--secondary-text)]">{step.content}</p>
              ) : null}
            </div>
            <time className="mt-0.5 shrink-0 text-[10px] tabular-nums text-[var(--tertiary-text)]">
              {new Date(step.updatedAt || step.createdAt).toLocaleTimeString(getDateTimeLocaleTag(), {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </div>
        ))}
      </div>
    </div>
  );
}
