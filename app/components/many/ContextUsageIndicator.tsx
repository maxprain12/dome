import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  buildContextSegments,
  contextUsagePercent,
  contextUsedTokens,
  formatContextTokens,
  type BudgetBreakdown,
  type ContextSegmentId,
  type LiveTokenUsage,
} from '@/lib/chat/contextUsage';

interface Props {
  breakdown: BudgetBreakdown;
  liveUsage?: LiveTokenUsage | null;
  budgetCapApprox?: number;
  variant?: 'header' | 'inline';
  className?: string;
}

function ContextDonut({ percent, size = 14 }: { percent: number; size?: number }) {
  const stroke = 2;
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
        stroke="var(--muted)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--foreground)"
        strokeWidth={stroke}
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export default function ContextUsageIndicator({
  breakdown,
  liveUsage = null,
  budgetCapApprox = 200_000,
  variant = 'header',
  className,
}: Props) {
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
            size="sm"
            className={className}
            title={t('many.context_usage_hint')}
            aria-label={t('many.context_usage_title')}
            aria-expanded={opened}
          />
        }
      >
        <ContextDonut percent={percent} size={variant === 'header' ? 14 : 16} />
        <Badge variant="secondary" className="tabular-nums">
          {percent}%
        </Badge>
      </PopoverTrigger>

      <PopoverContent side="bottom" align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">{t('many.context_usage_title')}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setOpened(false)}
            aria-label={t('many.context_usage_close')}
          >
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        </div>

        <div className="flex items-center justify-between px-3 py-2 text-sm">
          <span>{t('many.context_usage_full', { percent })}</span>
          <span className="tabular-nums text-muted-foreground">
            {t('many.context_usage_tokens', {
              used: formatContextTokens(used),
              cap: formatContextTokens(cap),
            })}
          </span>
        </div>

        <div className="px-3 pb-2">
          <Progress value={percent} className="h-2" />
          <div className="mt-1 flex h-1.5 overflow-hidden rounded-full">
            {segments.map((seg) => (
              <span
                key={seg.id}
                className="h-full transition-opacity"
                style={{
                  width: `${Math.min(100, (seg.tokens / cap) * 100)}%`,
                  background: seg.color,
                  opacity: hoveredId && hoveredId !== seg.id ? 0.35 : 1,
                }}
              />
            ))}
          </div>
        </div>

        <ul className="flex flex-col gap-0.5 px-2 pb-2">
          {segments.map((seg) => (
            <li
              key={seg.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
              data-active={hoveredId === seg.id || undefined}
              onMouseEnter={() => setHoveredId(seg.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: seg.color }} />
              <span className="min-w-0 flex-1 truncate">{seg.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatContextTokens(seg.tokens)}
              </span>
            </li>
          ))}
        </ul>

        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          {t('many.context_usage_footnote')}
        </p>
      </PopoverContent>
    </Popover>
  );
}

export type { BudgetBreakdown, LiveTokenUsage };
