import type { ReactNode } from 'react';
import { DomainStatChips, type DomainStat } from '@/components/shared/DomainStatChips';
import { hubFieldLabelClass } from '@/components/shared/hubChrome';
import { cn } from '@/lib/utils';

export type HubMetric = {
  id: string;
  name: string;
  value: string | number;
  trend?: ReactNode;
};

/** KPI row for hub canvases. Prefer this over ad-hoc grids. */
export function HubMetricGrid({
  metrics,
  className,
  chips,
  compact,
}: {
  metrics?: HubMetric[];
  chips?: DomainStat[];
  compact?: boolean;
  className?: string;
}) {
  if (chips && chips.length > 0) {
    return <DomainStatChips stats={chips} compact={compact} className={className} />;
  }
  if (!metrics || metrics.length === 0) return null;
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-5 sm:gap-0',
        className,
      )}
    >
      {metrics.map((metric) => (
        <div
          key={metric.id}
          className="flex flex-col gap-1 sm:border-l sm:border-border/70 sm:px-4 sm:first:border-l-0 sm:first:pl-0"
        >
          <span className={hubFieldLabelClass}>{metric.name}</span>
          <span className="text-2xl font-semibold tabular-nums tracking-tight">{metric.value}</span>
          {metric.trend}
        </div>
      ))}
    </div>
  );
}
