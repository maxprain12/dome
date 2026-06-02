import { useTranslation } from 'react-i18next';

/** Mirrors `measurePrompt()` output from the main process (char/4 heuristic). */
export interface BudgetBreakdown {
  systemApprox: number;
  toolsApprox: number;
  historyApprox: number;
  totalApprox: number;
  toolCount: number;
  historyTurns: number;
}

/** Provider-reported usage (OpenAI / Dome proxy / etc.). */
export interface LiveTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

function formatThousands(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n < 1000) return `${Math.round(n)}`;
  return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
}

interface Props {
  breakdown: BudgetBreakdown;
  /** Real provider usage when available (replaces approx display in badge/pill). */
  liveUsage?: LiveTokenUsage | null;
  /** Pill badge, compact pill+bar above composer, or full-width bar. */
  variant?: 'badge' | 'bar' | 'pill';
  /** Upper bound for bar fill percentage (estimated tokens). */
  budgetCapApprox?: number;
}

/**
 * Compact telemetry badge: estimated prompt tokens before provider billing.
 */
export default function TokenBudgetBadge({
  breakdown,
  liveUsage = null,
  variant = 'badge',
  budgetCapApprox = 200_000,
}: Props) {
  const { t } = useTranslation();
  const tip = `${t('many.token_budget_title')}${breakdown.historyTurns} turns · ${breakdown.toolCount} tools · ~${breakdown.systemApprox} sys · ~${breakdown.toolsApprox} tools · ~${breakdown.historyApprox} hist`;

  const cap = Number.isFinite(budgetCapApprox) && budgetCapApprox > 0 ? budgetCapApprox : 200_000;
  const hasLive =
    liveUsage &&
    (liveUsage.inputTokens > 0 || liveUsage.outputTokens > 0 || liveUsage.totalTokens > 0);
  const liveTotal = hasLive
    ? liveUsage.totalTokens > 0
      ? liveUsage.totalTokens
      : liveUsage.inputTokens + liveUsage.outputTokens
    : 0;
  const pct = Math.min(
    100,
    Math.round(((hasLive ? liveTotal : breakdown.totalApprox) / cap) * 100),
  );
  const liveLabel = hasLive
    ? `${formatThousands(liveUsage.inputTokens)} in / ${formatThousands(liveUsage.outputTokens)} out`
    : null;

  if (variant === 'pill') {
    return (
      <span className="many-token-budget-pill" title={tip}>
        <span>
          {hasLive ? (
            <>
              {t('many.token_live_short')}: {liveLabel}
            </>
          ) : (
            <>
              ≈ {formatThousands(breakdown.totalApprox)} / {formatThousands(cap)} tokens
            </>
          )}
        </span>
        <span className="many-token-budget-pill__bar" aria-hidden>
          <span className="many-token-budget-pill__fill" style={{ width: `${pct}%` }} />
        </span>
      </span>
    );
  }

  if (variant === 'bar') {
    return (
      <div className="many-token-budget-meta w-full min-w-0" title={tip}>
        <div className="mb-1 flex justify-between gap-2 text-[11px] text-[var(--quaternary-text)]">
          <span className="font-medium text-[var(--secondary-text)]">{t('many.token_budget_short')}</span>
          <span className="tabular-nums text-[var(--primary-text)]">
            {hasLive ? (
              <>
                {t('many.token_live_short')}: {liveLabel}
              </>
            ) : (
              <>
                ≈ {formatThousands(breakdown.totalApprox)} / {formatThousands(cap)}
              </>
            )}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full border border-[var(--border-soft)] bg-[var(--bg-secondary)]">
          <div className="many-token-budget-fill h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--tertiary-text)]"
      title={tip}
    >
      <span className="font-medium text-[var(--secondary-text)]">
        {hasLive ? t('many.token_live_short') : t('many.token_budget_short')}
      </span>
      <span style={{ color: 'var(--primary-text)' }}>
        {hasLive ? liveLabel : `≈ ${formatThousands(breakdown.totalApprox)}`}
      </span>
      <span className="tabular-nums">tok</span>
    </span>
  );
}
