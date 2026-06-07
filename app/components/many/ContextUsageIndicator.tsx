import { useMemo, useState } from 'react';
import { Popover } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
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
  /** Compact trigger for header; popup variant for composer row */
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
        stroke="var(--bg-tertiary)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--primary-text)"
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
  const [opened, { open, close, toggle }] = useDisclosure(false);
  const [hoveredId, setHoveredId] = useState<ContextSegmentId | null>(null);

  const cap = Number.isFinite(budgetCapApprox) && budgetCapApprox > 0 ? budgetCapApprox : 200_000;
  const used = contextUsedTokens(breakdown, liveUsage);
  const percent = contextUsagePercent(used, cap);
  const segments = useMemo(() => buildContextSegments(breakdown, t), [breakdown, t]);

  return (
    <Popover
      opened={opened}
      onChange={(next) => (next ? open() : close())}
      position="bottom-end"
      offset={8}
      width={320}
      shadow="md"
      radius="md"
      withinPortal
    >
      <Popover.Target>
        <button
          type="button"
          className={
            className ??
            (variant === 'header'
              ? 'many-context-trigger many-context-trigger--header'
              : 'many-context-trigger many-context-trigger--inline')
          }
          onClick={toggle}
          title={t('many.context_usage_hint')}
          aria-label={t('many.context_usage_title')}
          aria-expanded={opened}
        >
          <ContextDonut percent={percent} size={variant === 'header' ? 14 : 16} />
          <span className="many-context-trigger__pct tabular-nums">{percent}%</span>
        </button>
      </Popover.Target>

      <Popover.Dropdown className="many-context-popup p-0">
        <div className="many-context-popup__header">
          <span className="many-context-popup__title">{t('many.context_usage_title')}</span>
          <button
            type="button"
            className="many-icon-btn"
            onClick={close}
            aria-label={t('many.context_usage_close')}
          >
            <X size={14} />
          </button>
        </div>

        <div className="many-context-popup__summary">
          <span>{t('many.context_usage_full', { percent })}</span>
          <span className="tabular-nums">
            {t('many.context_usage_tokens', {
              used: formatContextTokens(used),
              cap: formatContextTokens(cap),
            })}
          </span>
        </div>

        <div className="many-context-popup__bar" aria-hidden>
          {segments.map((seg) => (
            <span
              key={seg.id}
              className="many-context-popup__bar-seg"
              style={{
                width: `${Math.min(100, (seg.tokens / cap) * 100)}%`,
                background: seg.color,
                opacity: hoveredId && hoveredId !== seg.id ? 0.35 : 1,
              }}
            />
          ))}
        </div>

        <ul className="many-context-popup__list">
          {segments.map((seg) => (
            <li
              key={seg.id}
              className="many-context-popup__row"
              data-active={hoveredId === seg.id || undefined}
              onMouseEnter={() => setHoveredId(seg.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <span className="many-context-popup__swatch" style={{ background: seg.color }} />
              <span className="many-context-popup__label">{seg.label}</span>
              <span className="many-context-popup__value tabular-nums">
                {formatContextTokens(seg.tokens)}
              </span>
            </li>
          ))}
        </ul>

        <p className="many-context-popup__footnote">{t('many.context_usage_footnote')}</p>
      </Popover.Dropdown>
    </Popover>
  );
}

export type { BudgetBreakdown, LiveTokenUsage };
