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

function formatThousands(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n < 1000) return `${Math.round(n)}`;
  return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
}

interface Props {
  breakdown: BudgetBreakdown;
}

/**
 * Compact telemetry badge: estimated prompt tokens before provider billing.
 */
export default function TokenBudgetBadge({ breakdown }: Props) {
  const { t } = useTranslation();
  const tip = `${t('many.token_budget_title')}${breakdown.historyTurns} turns · ${breakdown.toolCount} tools · ~${breakdown.systemApprox} sys · ~${breakdown.toolsApprox} tools · ~${breakdown.historyApprox} hist`;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--tertiary-text)]"
      title={tip}
    >
      <span className="font-medium text-[var(--secondary-text)]">{t('many.token_budget_short')}</span>
      <span style={{ color: 'var(--primary-text)' }}>≈ {formatThousands(breakdown.totalApprox)}</span>
      <span className="tabular-nums">tok</span>
    </span>
  );
}
