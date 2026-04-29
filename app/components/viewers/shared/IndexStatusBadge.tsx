import { useCallback, useEffect, useRef, useState } from 'react';
import { Brain, Loader2, HelpCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DomeButton from '@/components/ui/DomeButton';
import DomeBadge from '@/components/ui/DomeBadge';

const INDEXABLE = new Set(['pdf', 'note', 'document', 'url', 'notebook', 'ppt', 'excel', 'image']);

interface IndexStatusBadgeProps {
  resourceId: string;
  resourceType?: string;
}

export default function IndexStatusBadge({ resourceId, resourceType }: IndexStatusBadgeProps) {
  const { t } = useTranslation();
  const [hasChunks, setHasChunks] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [globalIndexing, setGlobalIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const indexable = resourceType ? INDEXABLE.has(resourceType) : true;

  const refresh = useCallback(async () => {
    if (!indexable) return;
    try {
      const res = await window.electron?.db?.semantic?.resourceHasChunks?.(resourceId);
      if (!mountedRef.current) return;
      if (res?.success && res.data) {
        setHasChunks(!!res.data.hasChunks);
        setError(null);
      } else {
        setHasChunks(false);
      }
    } catch {
      if (mountedRef.current) setHasChunks(false);
    }
  }, [resourceId, indexable]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    const unsub = window.electron?.db?.semantic?.onProgress?.((p) => {
      if (!mountedRef.current) return;
      if (p?.step === resourceId) {
        setBusy(true);
      }
      if (p?.total != null && p.done != null && p.done >= p.total) {
        setGlobalIndexing(false);
      } else if (p?.total) {
        setGlobalIndexing(true);
      }
    });

    return () => {
      mountedRef.current = false;
      unsub?.();
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [refresh, resourceId]);

  const handleRetry = async () => {
    setBusy(true);
    setError(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    try {
      await window.electron?.db?.semantic?.indexResource?.(resourceId);
      pollRef.current = setInterval(async () => {
        await refresh();
        const res = await window.electron?.db?.semantic?.resourceHasChunks?.(resourceId);
        if (res?.success && res.data?.hasChunks) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setBusy(false);
        }
      }, 2000);
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setBusy(false);
        void refresh();
      }, 120000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (!indexable) return null;

  if (hasChunks === null) {
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 size={12} className="animate-spin shrink-0 opacity-50" aria-hidden />
      </span>
    );
  }

  if (busy || globalIndexing) {
    return (
      <span className="inline-flex items-center gap-1.5 max-w-full min-w-0">
        <Loader2 size={12} className="animate-spin shrink-0 text-[var(--accent)]" aria-hidden />
        <DomeBadge label={t('viewer.indexing')} color="var(--accent)" size="xs" />
      </span>
    );
  }

  if (hasChunks) {
    return (
      <span className="inline-flex items-center gap-1 min-w-0" title={t('viewer.ready_for_ai_title')}>
        <Brain size={12} className="shrink-0 text-[var(--success)]" aria-hidden />
        <DomeBadge label={t('viewer.ready_for_ai')} color="var(--success)" size="xs" />
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 min-w-0"
      title={error || t('viewer.not_indexed_title')}
    >
      <HelpCircle size={12} className="shrink-0 text-[var(--tertiary-text)]" aria-hidden />
      <DomeBadge label={t('viewer.not_indexed')} variant="outline" color="var(--tertiary-text)" size="xs" />
      <DomeButton
        type="button"
        variant="ghost"
        size="xs"
        iconOnly
        onClick={handleRetry}
        disabled={busy}
        title={t('viewer.retry_indexing')}
        className="!p-0.5 ml-0.5 min-w-0 h-auto text-inherit opacity-70 hover:opacity-100"
        aria-label={t('viewer.retry_indexing')}
      >
        <RefreshCw size={11} className={busy ? 'animate-spin' : ''} />
      </DomeButton>
    </span>
  );
}
