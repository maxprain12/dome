import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Layers01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';

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
    <output className="mx-3 mb-2 block not-typeset">
      <Marker variant="border">
        <MarkerIcon>
          <HugeiconsIcon icon={Layers01Icon} />
        </MarkerIcon>
        <MarkerContent className="min-w-0 flex-1 text-xs">
          <p className="font-medium text-foreground">{title}</p>
          <p className="mt-0.5 tabular-nums text-muted-foreground">{detail}</p>
          {event.summaryPreview ? (
            <p className="mt-1 line-clamp-2 text-[11px] opacity-80">{event.summaryPreview}</p>
          ) : null}
          {onDismiss ? (
            <Button
              type="button"
              variant="link"
              size="xs"
              className="mt-1 h-auto p-0 text-[11px] opacity-70"
              onClick={onDismiss}
            >
              {t('many.compaction_dismiss')}
            </Button>
          ) : null}
        </MarkerContent>
      </Marker>
    </output>
  );
}
