import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Layers01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { MessageFooter } from '@/components/ui/message';
import { Spinner } from '@/components/ui/spinner';
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment';
import type { CompactionNoticeData } from '@/lib/many/types';
import type { PendingPdfRegion } from '@/lib/store/useManyStore';

/** Transient chrome of the conversation: compaction, PDF-region, loading, error. */

function formatThousands(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n < 1000) return `${Math.round(n)}`;
  return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
}

export function ManyCompactionNotice({
  event,
  onDismiss,
}: {
  event: CompactionNoticeData;
  onDismiss?: () => void;
}) {
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
      : t('many.compaction_detail_before', { before: formatThousands(event.tokensBefore) });

  return (
    <output className="not-typeset mx-3 mb-2 block">
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

export function ManyPdfRegionChip({
  pending,
  onDismiss,
}: {
  pending: PendingPdfRegion;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="mx-3 mb-2">
      <Attachment state="done" size="sm" className="w-full max-w-none border-primary/25 bg-primary/5">
        <AttachmentMedia variant="image">
          <img src={pending.imageDataUrl} alt="" />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{t('many.pdf_region_banner_title')}</AttachmentTitle>
          <AttachmentDescription>
            {pending.resourceTitle} · {t('many.pdf_region_banner_page', { page: pending.page })}
          </AttachmentDescription>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {t('many.pdf_region_banner_hint')}
          </p>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction
            type="button"
            aria-label={t('many.pdf_region_banner_dismiss')}
            onClick={onDismiss}
          >
            <HugeiconsIcon icon={Cancel01Icon} />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
    </div>
  );
}

export function ManyLoadingMarker({ label }: { label: string }) {
  return (
    <Marker role="status">
      <MarkerIcon>
        <Spinner />
      </MarkerIcon>
      <MarkerContent className="shimmer">{label}</MarkerContent>
    </Marker>
  );
}

export function ManyErrorNotice({
  message,
  onRetry,
  onReport,
}: {
  message: string;
  onRetry: () => void;
  onReport: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Bubble variant="destructive">
        <BubbleContent>
          <p className="font-medium">{t('common.error')}</p>
          <p className="mt-1 text-sm opacity-90">{message}</p>
        </BubbleContent>
      </Bubble>
      <MessageFooter className="gap-2">
        <Button type="button" size="xs" onClick={onRetry}>
          {t('common.retry')}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={onReport}>
          {t('many.error_report')}
        </Button>
      </MessageFooter>
    </div>
  );
}
