import { useEffect, useRef, useState } from 'react';
import { Brain, Loader2, AlertCircle, HelpCircle, RefreshCw } from 'lucide-react';
import type { IndexingStatus, ResourceIndexStatus } from '@/lib/db/pageindex';
import { getResourceIndexStatus, indexResource } from '@/lib/db/pageindex';

interface IndexStatusBadgeProps {
  resourceId: string;
  resourceType?: string;
}

const POLL_INTERVAL_MS = 2000;

const DOCLING_STEP_LABELS: Record<string, string> = {
  converting: 'Convirtiendo con Docling…',
  storing_images: 'Guardando imágenes…',
  updating_resource: 'Actualizando documento…',
};

export default function IndexStatusBadge({ resourceId, resourceType }: IndexStatusBadgeProps) {
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
    setStatusData(prev => prev ? { ...prev, status: 'pending', progress: 0, step: 'Reintentando…' } : null);
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
    const stepLabel = DOCLING_STEP_LABELS[doclingPhase.status] ?? 'Convirtiendo…';
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
      <div className="index-status-badge index-status-none" title="Este documento aún no ha sido indexado para IA">
        <HelpCircle size={12} />
        <span>Sin indexar para IA</span>
      </div>
    );
  }

  if (status === 'processing' || status === 'pending') {
    return (
      <div className="index-status-badge index-status-processing">
        <Loader2 size={12} className="index-status-spinner" />
        <span>{step || 'Indexando…'}</span>
        {status === 'processing' && progress > 0 && (
          <span className="index-status-progress">{progress}%</span>
        )}
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className="index-status-badge index-status-done" title="El documento está indexado y la IA puede leerlo">
        <Brain size={12} />
        <span>Listo para IA</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="index-status-badge index-status-error" title={error || 'Error al indexar'}>
        <AlertCircle size={12} />
        <span>Error al indexar</span>
        <button
          className="index-status-retry"
          onClick={handleRetry}
          disabled={isRetrying}
          title="Reintentar indexado"
        >
          <RefreshCw size={11} />
        </button>
      </div>
    );
  }

  return null;
}
