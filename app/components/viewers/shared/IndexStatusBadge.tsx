import { useEffect, useRef, useState } from 'react';
import { Brain, Loader2, AlertCircle, HelpCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { IndexingStatus, ResourceIndexStatus } from '@/lib/db/pageindex';
import { getResourceIndexStatus, indexResource } from '@/lib/db/pageindex';

interface IndexStatusBadgeProps {
  resourceId: string;
  resourceType?: string;
}

const POLL_INTERVAL_MS = 2000;

export default function IndexStatusBadge({ resourceId, resourceType }: IndexStatusBadgeProps) {
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

  // Start polling when processing, stop when done/error
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

    // Listen for Docling conversion progress (automatic indexer)
    const unsubDocling = window.electron?.on?.(
      'docling:progress',
      (event: { resourceId: string; status: string; progress?: number }) => {
        if (!mountedRef.current) return;
        if (event.resourceId !== resourceId) return;
        setDoclingPhase({ status: event.status, progress: event.progress ?? 0 });
      }
    );

    // Listen for live progress events from the main process (PageIndex)
    const unsubPageIndex = window.electron?.on?.(
      'pageindex:progress',
      (event: ResourceIndexStatus & { resourceId: string }) => {
        if (!mountedRef.current) return;
        if (event.resourceId !== resourceId) return;
        setDoclingPhase(null); // Docling done, now in PageIndex phase
        setStatusData(prev => ({ ...(prev ?? { success: true }), ...event }));

        // When done, do a final fetch to get indexed_at from DB
        if (event.status === 'done' || event.status === 'error') {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setTimeout(fetchStatus, 500);
        }
      }
    );

    return () => {
      mountedRef.current = false;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      unsubDocling?.();
      unsubPageIndex?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  const handleRetry = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    setStatusData(prev => prev ? { ...prev, status: 'pending', progress: 0, step: t('viewer.retrying') } : null);
    await indexResource(resourceId);
    setIsRetrying(false);
    // Poll for progress
    pollRef.current = setInterval(async () => {
      const updated = await fetchStatus();
      if (updated?.status !== 'processing' && updated?.status !== 'pending') {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, POLL_INTERVAL_MS);
  };

  // Docling phase takes priority (conversion before indexing)
  if (doclingPhase) {
    const stepLabel = t(`viewer.docling_${doclingPhase.status}`) ?? t('viewer.converting');
    return (
      <div className="index-status-badge index-status-processing">
        <Loader2 size={12} className="index-status-spinner" />
        <span>{stepLabel}</span>
        {doclingPhase.progress > 0 && (
          <span className="index-status-progress">{doclingPhase.progress}%</span>
        )}
      </div>
    );
  }

  if (!statusData) return null;

  const { status, progress, step, error } = statusData;

  if (status === 'none') {
    // Document not indexed yet — show a subtle hint
    return (
      <div className="index-status-badge index-status-none" title={t('viewer.not_indexed_title')}>
        <HelpCircle size={12} />
        <span>{t('viewer.not_indexed')}</span>
      </div>
    );
  }

  if (status === 'processing' || status === 'pending') {
    return (
      <div className="index-status-badge index-status-processing">
        <Loader2 size={12} className="index-status-spinner" />
        <span>{step || t('viewer.indexing')}</span>
        {status === 'processing' && progress > 0 && (
          <span className="index-status-progress">{progress}%</span>
        )}
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className="index-status-badge index-status-done" title={t('viewer.ready_for_ai_title')}>
        <Brain size={12} />
        <span>{t('viewer.ready_for_ai')}</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="index-status-badge index-status-error" title={error || t('viewer.indexing_error_title')}>
        <AlertCircle size={12} />
        <span>{t('viewer.indexing_error')}</span>
        <button
          className="index-status-retry"
          onClick={handleRetry}
          disabled={isRetrying}
          title={t('viewer.retry_indexing')}
        >
          <RefreshCw size={11} />
        </button>
      </div>
    );
  }

  return null;
}
