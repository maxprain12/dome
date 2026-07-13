import { HugeiconsIcon } from '@hugeicons/react';
import {
  BrainIcon,
  Loading03Icon,
  HelpCircleIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
const INDEXABLE = new Set(['pdf', 'note', 'document', 'url', 'notebook', 'ppt', 'excel', 'image', 'artifact']);

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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const retryResourceIdRef = useRef<string | null>(null);

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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
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
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    try {
      await window.electron?.db?.semantic?.indexResource?.(resourceId);
      retryResourceIdRef.current = resourceId;
      pollRef.current = setInterval(async () => {
        if (retryResourceIdRef.current !== resourceId) return;
        await refresh();
        const res = await window.electron?.db?.semantic?.resourceHasChunks?.(resourceId);
        if (retryResourceIdRef.current !== resourceId) return;
        if (res?.success && res.data?.hasChunks) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setBusy(false);
        }
      }, 2000);
      timeoutRef.current = setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        retryResourceIdRef.current = null;
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
        <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin shrink-0 opacity-50" aria-hidden />
      </span>
    );
  }

  if (busy || globalIndexing) {
    return (
      <span className="inline-flex items-center gap-1.5 max-w-full min-w-0">
        <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin shrink-0 text-primary" aria-hidden />
        <Badge variant="secondary" className="max-w-full font-semibold text-[10px] px-1.5 py-0.5 gap-1 h-auto" style={{ background: 'color-mix(in srgb, var(--primary) 18%, transparent)', color: 'var(--primary)', borderColor: 'transparent' }}><span className="truncate">{t('viewer.indexing')}</span></Badge>
      </span>
    );
  }

  if (hasChunks) {
    return (
      <span className="inline-flex items-center gap-1 min-w-0" title={t('viewer.ready_for_ai_title')}>
        <HugeiconsIcon icon={BrainIcon} size={12} className="shrink-0 text-[var(--success)]" aria-hidden />
        <Badge variant="secondary" className="max-w-full font-semibold text-[10px] px-1.5 py-0.5 gap-1 h-auto" style={{ background: 'color-mix(in srgb, var(--success) 18%, transparent)', color: 'var(--success)', borderColor: 'transparent' }}><span className="truncate">{t('viewer.ready_for_ai')}</span></Badge>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 min-w-0"
      title={error || t('viewer.not_indexed_title')}
    >
      <HugeiconsIcon icon={HelpCircleIcon} size={12} className="shrink-0 text-muted-foreground" aria-hidden />
      <Badge variant="outline" className="max-w-full font-semibold text-[10px] px-1.5 py-0.5 gap-1 h-auto" style={{ borderColor: 'var(--muted-foreground)', color: 'var(--muted-foreground)', background: 'transparent' }}><span className="truncate">{t('viewer.not_indexed')}</span></Badge>
      <Button type="button"
  variant="ghost"
  onClick={handleRetry}
  disabled={busy}
  title={t('viewer.retry_indexing')}
  className="!p-0.5 ml-0.5 min-w-0 h-auto text-inherit opacity-70 hover:opacity-100"
  aria-label={t('viewer.retry_indexing')}
  size="icon-xs">
        <HugeiconsIcon icon={RefreshIcon} size={11} className={busy ? 'animate-spin' : ''} />
      </Button>
    </span>
  );
}
