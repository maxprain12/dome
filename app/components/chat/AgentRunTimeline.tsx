import { useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { CancelCircleIcon, CheckmarkCircle02Icon, ChevronRightIcon, CircleIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from 'react-i18next';
import type { PersistentRunStep } from '@/lib/automations/api';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type AgentTimelineSurfaceVariant = 'default' | 'many';

interface AgentRunTimelineProps {
  steps: PersistentRunStep[];
  className?: string;
  surfaceVariant?: AgentTimelineSurfaceVariant;
}

function statusIcon(step: PersistentRunStep) {
  switch (step.status) {
    case 'running':
    case 'queued':
    case 'pending':
    case 'waiting_approval':
      return <Spinner className="size-3.5 text-primary" aria-hidden />;
    case 'completed':
    case 'done':
      return <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5 text-success" aria-hidden />;
    case 'failed':
    case 'error':
    case 'cancelled':
      return <HugeiconsIcon icon={CancelCircleIcon} className="size-3.5 text-destructive" aria-hidden />;
    default: {
      const exhaustive: never = step.status;
      void exhaustive;
      return <HugeiconsIcon icon={CircleIcon} className="size-3.5 text-muted-foreground" aria-hidden />;
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

export default function AgentRunTimeline({ steps, className, surfaceVariant = 'default' }: AgentRunTimelineProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const visibleSteps = useMemo(() => (expanded ? steps : steps.slice(-4)), [expanded, steps]);
  if (steps.length === 0) return null;

  const surfaceClass =
    surfaceVariant === 'many' ? 'many-chat-timeline-root' : 'ai-surface-card';

  return (
    <Card className={cn(surfaceClass, 'w-full gap-1 py-2', className)}>
      <CardHeader className="px-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-expanded={expanded}
      >
        <HugeiconsIcon
          icon={ChevronRightIcon}
          className={cn('size-3.5 text-muted-foreground transition-transform', expanded && 'rotate-90')}
          aria-hidden
        />
        <span className="text-[12px] font-semibold text-muted-foreground">
          {t('chat.agent_timeline_title', { count: steps.length })}
        </span>
      </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 px-2">
        {visibleSteps.map((step) => (
          <div key={step.id} className="grid grid-cols-[16px_1fr_auto] items-start gap-2 rounded-lg px-2 py-1.5">
            <div className="mt-0.5">{statusIcon(step)}</div>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-foreground">{step.title}</div>
              <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                <span>{t(statusLabelKey(step.status))}</span>
                <span>{step.stepType}</span>
              </div>
              {expanded && step.content ? (
                <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted-foreground">{step.content}</p>
              ) : null}
            </div>
            <time
              suppressHydrationWarning
              className="mt-0.5 shrink-0 text-[10px] tabular-nums text-muted-foreground"
            >
              {new Date(step.updatedAt || step.createdAt).toLocaleTimeString(getDateTimeLocaleTag(), {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
