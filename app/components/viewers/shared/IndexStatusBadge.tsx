import { useEffect, useRef, useState } from 'react';
import { Brain, Loader2, AlertCircle, HelpCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { IndexingStatus, ResourceIndexStatus } from '@/lib/db/pageindex';
import { getResourceIndexStatus, indexResource } from '@/lib/db/pageindex';
import DomeButton from '@/components/ui/DomeButton';
import DomeBadge from '@/components/ui/DomeBadge';

interface IndexStatusBadgeProps {
  resourceId: string;
  resourceType?: string;
}

const POLL_INTERVAL_MS = 2000;

export default function IndexStatusBadge({ resourceId, resourceType: _resourceType }: IndexStatusBadgeProps) {
  const { t } = useTranslation();
  const [statusData, setStatusData] = useState<ResourceIndexStatus | null>(null);
  const [doclingPhase, setDoclingPhase] = useState<{ status: string; progress: number } | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const fetchStatus = async () => {
    if (!mountedRef.current) return;
    const data = await getResourceIndexStatus(resourceId);
    if (!mountedRef.current) return;
    setStatusData(data);
    return data;
  };

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      const data = await fetchStatus();
      const currentStatus = data?.status;

      if (currentStatus === 'processing' || currentStatus === 'pending') {
        pollRef.current = setInterval(async () => {
          const updated = await fetchStatus();
          if (updated?.status !== 'processing' && updated?.status !== 'pending') {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, POLL_INTERVAL_MS);
      }
    };

    init();

    const unsubDocling = window.electron?.on?.(
      'docling:progress',
      (event: { resourceId: string; status: string; progress?: number }) => {
        if (!mountedRef.current) return;
        if (event.resourceId !== resourceId) return;
        setDoclingPhase({ status: event.status, progress: event.progress ?? 0 });
      },
    );

    const unsubPageIndex = window.electron?.on?.(
      'pageindex:progress',
      (event: ResourceIndexStatus & { resourceId: string }) => {
        if (!mountedRef.current) return;
        if (event.resourceId !== resourceId) return;
        setDoclingPhase(null);
        setStatusData((prev) => ({ ...(prev ?? { success: true }), ...event }));

        if (event.status === 'done' || event.status === 'error') {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setTimeout(fetchStatus, 500);
        }
      },
    );

    return () => {
      mountedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      unsubDocling?.();
      unsubPageIndex?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  const handleRetry = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    setStatusData((prev) =>
      prev ? { ...prev, status: 'pending' as IndexingStatus, progress: 0, step: t('viewer.retrying') } : null,
    );
    await indexResource(resourceId);
    setIsRetrying(false);
    pollRef.current = setInterval(async () => {
      const updated = await fetchStatus();
      if (updated?.status !== 'processing' && updated?.status !== 'pending') {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, POLL_INTERVAL_MS);
  };

  if (doclingPhase) {
    const stepLabel = t(`viewer.docling_${doclingPhase.status}`) ?? t('viewer.converting');
    const pct = doclingPhase.progress > 0 ? ` ${doclingPhase.progress}%` : '';
    return (
      <span className="inline-flex items-center gap-1.5 max-w-full min-w-0">
        <Loader2 size={12} className="animate-spin shrink-0 text-[var(--accent)]" aria-hidden />
        <DomeBadge label={`${stepLabel}${pct}`} color="var(--accent)" size="xs" />
      </span>
    );
  }

  if (!statusData) return null;

  const { status, progress, step, error } = statusData;

  if (status === 'none') {
    return (
      <span className="inline-flex items-center gap-1 min-w-0" title={t('viewer.not_indexed_title')}>
        <HelpCircle size={12} className="shrink-0 text-[var(--tertiary-text)]" aria-hidden />
        <DomeBadge label={t('viewer.not_indexed')} variant="outline" color="var(--tertiary-text)" size="xs" />
      </span>
    );
  }

  if (status === 'processing' || status === 'pending') {
    const pct = status === 'processing' && progress > 0 ? ` ${progress}%` : '';
    return (
      <span className="inline-flex items-center gap-1.5 max-w-full min-w-0">
        <Loader2 size={12} className="animate-spin shrink-0 text-[var(--accent)]" aria-hidden />
        <DomeBadge label={`${step || t('viewer.indexing')}${pct}`} color="var(--accent)" size="xs" />
      </span>
    );
  }

  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 min-w-0" title={t('viewer.ready_for_ai_title')}>
        <Brain size={12} className="shrink-0 text-[#16a34a]" aria-hidden />
        <DomeBadge label={t('viewer.ready_for_ai')} color="#16a34a" size="xs" />
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span
        className="inline-flex items-center gap-1 min-w-0"
        title={error || t('viewer.indexing_error_title')}
      >
        <AlertCircle size={12} className="shrink-0 text-[#dc2626]" aria-hidden />
        <DomeBadge label={t('viewer.indexing_error')} color="#dc2626" size="xs" />
        <DomeButton
          type="button"
          variant="ghost"
          size="xs"
          iconOnly
          onClick={handleRetry}
          disabled={isRetrying}
          title={t('viewer.retry_indexing')}
          className="!p-0.5 ml-0.5 min-w-0 h-auto text-inherit opacity-70 hover:opacity-100"
          aria-label={t('viewer.retry_indexing')}
        >
          <RefreshCw size={11} className={isRetrying ? 'animate-spin' : ''} />
        </DomeButton>
      </span>
    );
  }

  return null;
}
