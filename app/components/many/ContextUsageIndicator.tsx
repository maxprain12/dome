import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  buildContextSegments,
  contextUsagePercent,
  contextUsedTokens,
  formatContextTokens,
  type BudgetBreakdown,
  type ContextSegmentId,
  type LiveTokenUsage,
} from '@/lib/chat/contextUsage';
import { cn } from '@/lib/utils';

interface ContextUsageIndicatorProps {
  breakdown: BudgetBreakdown;
  liveUsage?: LiveTokenUsage | null;
  budgetCapApprox?: number;
  variant?: 'header' | 'inline';
  className?: string;
}

/** Tiny arc gauge — fills clockwise with usage. */
function ContextGauge({ percent, size = 14 }: { percent: number; size?: number }) {
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className="stroke-border"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference - filled}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={cn(
          'transition-[stroke-dasharray] motion-reduce:transition-none',
          percent >= 85 ? 'stroke-destructive' : 'stroke-primary',
        )}
      />
    </svg>
  );
}

/**
 * Context budget gauge. Trigger = arc + percentage; popover = segmented usage
 * bar with a legend of every prompt section (system, tools, history…).
 */
export default function ContextUsageIndicator({
  breakdown,
  liveUsage = null,
  budgetCapApprox = 200_000,
  variant = 'header',
  className,
}: ContextUsageIndicatorProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [hoveredId, setHoveredId] = useState<ContextSegmentId | null>(null);

  const cap = Number.isFinite(budgetCapApprox) && budgetCapApprox > 0 ? budgetCapApprox : 200_000;
  const used = contextUsedTokens(breakdown, liveUsage);
  const percent = contextUsagePercent(used, cap);
  const segments = useMemo(() => buildContextSegments(breakdown, t), [breakdown, t]);

  return (
    <Popover open={opened} onOpenChange={setOpened}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size={variant === 'inline' ? 'sm' : 'xs'}
            className={cn('gap-1.5 text-muted-foreground', className)}
            title={t('many.context_usage_hint')}
            aria-label={t('many.context_usage_title')}
            aria-expanded={opened}
          />
        }
      >
        <ContextGauge percent={percent} size={variant === 'inline' ? 16 : 13} />
        <span className="text-[11px] tabular-nums">{percent}%</span>
      </PopoverTrigger>

      <PopoverContent side="top" align="end" className="w-80 p-0">
        <div className="flex items-baseline justify-between px-3.5 pb-1 pt-3">
          <span className="text-sm font-semibold tracking-tight">
            {t('many.context_usage_title')}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('many.context_usage_tokens', {
              used: formatContextTokens(used),
              cap: formatContextTokens(cap),
            })}
          </span>
        </div>

        <div className="px-3.5 py-2">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {segments.map((seg) => (
              <span
                key={seg.id}
                className="h-full transition-opacity"
                style={{
                  width: `${Math.min(100, (seg.tokens / cap) * 100)}%`,
                  background: seg.color,
                  opacity: hoveredId && hoveredId !== seg.id ? 0.3 : 1,
                }}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t('many.context_usage_full', { percent })}
          </p>
        </div>

        <ul className="flex flex-col gap-0.5 px-2 pb-2">
          {segments.map((seg) => (
            <li
              key={seg.id}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted/50"
              onMouseEnter={() => setHoveredId(seg.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: seg.color }} />
              <span className="min-w-0 flex-1 truncate">{seg.label}</span>
              <Badge variant="outline" className="shrink-0 border-transparent px-0 font-normal tabular-nums text-muted-foreground">
                {formatContextTokens(seg.tokens)}
              </Badge>
            </li>
          ))}
        </ul>

        <p className="border-t px-3.5 py-2 text-[11px] leading-snug text-muted-foreground">
          {t('many.context_usage_footnote')}
        </p>
      </PopoverContent>
    </Popover>
  );
}

export type { BudgetBreakdown, LiveTokenUsage };
