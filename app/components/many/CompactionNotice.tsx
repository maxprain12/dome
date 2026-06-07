import { useTranslation } from 'react-i18next';
import { Layers } from 'lucide-react';

export interface CompactionNoticeData {
  tokensBefore: number;
  tokensAfter: number | null;
  summaryPreview: string;
  automatic: boolean;
  at: number;
}

function formatThousands(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n < 1000) return `${Math.round(n)}`;
  return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
}

interface Props {
  event: CompactionNoticeData;
  onDismiss?: () => void;
}

/** Inline notice when the agent session was compacted to free context. */
export default function CompactionNotice({ event, onDismiss }: Props) {
  const { t } = useTranslation();
  const title = event.automatic
    ? t('many.compaction_auto_title')
    : t('many.compaction_manual_title');
  const detail =
    event.tokensAfter != null && event.tokensAfter > 0
      ? t('many.compaction_detail', {
          before: formatThousands(event.tokensBefore),
          after: formatThousands(event.tokensAfter),
        })
      : t('many.compaction_detail_before', {
          before: formatThousands(event.tokensBefore),
        });

  return (
    <div
      className="mx-3 mb-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px]"
      style={{
        borderColor: 'var(--border-soft)',
        background: 'var(--bg-secondary)',
        color: 'var(--secondary-text)',
      }}
      role="status"
    >
      <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
      <div className="min-w-0 flex-1">
        <p className="font-medium" style={{ color: 'var(--primary-text)' }}>
          {title}
        </p>
        <p className="mt-0.5 tabular-nums">{detail}</p>
        {event.summaryPreview ? (
          <p className="mt-1 line-clamp-2 text-[11px] opacity-80">{event.summaryPreview}</p>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="shrink-0 text-[11px] underline opacity-70 hover:opacity-100"
          onClick={onDismiss}
        >
          {t('many.compaction_dismiss')}
        </button>
      ) : null}
    </div>
  );
}
