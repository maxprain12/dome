import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle2, BookOpen, RefreshCw } from 'lucide-react';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import DomeProgressBar from '@/components/ui/DomeProgressBar';
import DomeCallout from '@/components/ui/DomeCallout';

const DOME_GREEN = '#596037';

interface PageIndexStatus {
  success: boolean;
  indexed_documents: number;
  total_indexable: number;
  unindexed: number;
  last_indexed_at: number | null;
}

interface IndexProgress {
  current: number;
  total: number;
  title?: string;
  status: 'starting' | 'indexing' | 'done' | 'error' | 'skipped' | 'finished';
  indexed?: number;
  failed?: number;
}

export default function IndexingSettings() {
  const { t } = useTranslation();
  const [pageIndexStatus, setPageIndexStatus] = useState<PageIndexStatus | null>(null);
  const [indexingMissing, setIndexingMissing] = useState(false);
  const [reindexingAll, setReindexingAll] = useState(false);
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
  const [indexResult, setIndexResult] = useState<{ indexed: number; failed: number; total: number } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const progressCleanupRef = useRef<(() => void) | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await window.electron?.invoke?.('pageindex:status');
      setPageIndexStatus(s ?? null);
    } catch { setPageIndexStatus(null); }
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(() => { if (!indexingMissing) loadStatus(); }, 5000);
    return () => clearInterval(interval);
  }, [loadStatus, indexingMissing]);

  const handleIndexMissing = async () => {
    setIndexingMissing(true);
    setIndexProgress(null);
    setIndexResult(null);
    setLastError(null);
    if (progressCleanupRef.current) progressCleanupRef.current();

    const cleanup = window.electron?.on?.('pageindex:progress', (data: IndexProgress) => {
      setIndexProgress(data);
      if (data.status === 'finished') {
        setIndexResult({ indexed: data.indexed ?? 0, failed: data.failed ?? 0, total: data.total });
        setIndexingMissing(false);
        loadStatus();
        progressCleanupRef.current?.();
        progressCleanupRef.current = null;
      }
    });
    progressCleanupRef.current = cleanup ?? null;

    try {
      const result = await window.electron?.invoke?.('pageindex:index-missing');
      if (!result?.success) {
        setLastError(result?.error || t('settings.indexing.error_index_failed'));
        setIndexingMissing(false);
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      setIndexingMissing(false);
    } finally {
      progressCleanupRef.current?.();
      progressCleanupRef.current = null;
    }
  };

  const handleReindexAll = async () => {
    setReindexingAll(true);
    setIndexProgress(null);
    setIndexResult(null);
    setLastError(null);
    try {
      const result = await window.electron?.invoke?.('pageindex:reindex');
      if (result?.success) {
        setIndexResult({ indexed: result.indexed ?? 0, failed: result.failed ?? 0, total: result.total ?? 0 });
        loadStatus();
      } else { setLastError(result?.error || t('settings.indexing.error_reindex_failed')); }
    } catch (e) { setLastError(e instanceof Error ? e.message : String(e)); }
    finally { setReindexingAll(false); }
  };

  const progressPercent = indexProgress && indexProgress.total > 0
    ? Math.round((indexProgress.current / indexProgress.total) * 100) : 0;

  const lastIndexedDate = pageIndexStatus?.last_indexed_at
    ? new Date(pageIndexStatus.last_indexed_at).toLocaleString() : null;

  const isBusy = indexingMissing || reindexingAll;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <DomeSubpageHeader
        className="!border-0 px-0 py-0 bg-transparent"
        title={t('settings.indexing.title')}
        subtitle={t('settings.indexing.subtitle')}
      />

      {/* Stats */}
      {pageIndexStatus?.success && (
        <div>
          <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.indexing.section_status')}</DomeSectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: t('settings.indexing.total'), value: pageIndexStatus.total_indexable, color: DOME_GREEN },
              { label: t('settings.indexing.indexed'), value: pageIndexStatus.indexed_documents, color: DOME_GREEN },
              { label: t('settings.indexing.pending'), value: pageIndexStatus.unindexed, color: pageIndexStatus.unindexed > 0 ? '#a37b00' : DOME_GREEN },
            ].map(({ label, value, color }) => (
              <DomeCard key={label} className="p-4">
                <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>{label}</p>
              </DomeCard>
            ))}
          </div>
          {lastIndexedDate && (
            <p className="text-[11px] mt-2" style={{ color: 'var(--dome-text-muted)', opacity: 0.7 }}>
              {t('settings.indexing.last_indexed')}: {lastIndexedDate}
            </p>
          )}
        </div>
      )}

      {/* Progress */}
      {indexingMissing && indexProgress && indexProgress.total > 0 && (
        <DomeCard className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs truncate max-w-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {indexProgress.status === 'indexing' && indexProgress.title ? `${t('settings.indexing.progress_indexing')}: ${indexProgress.title}` : t('settings.indexing.progress_preparing')}
            </p>
            <span className="text-xs font-medium" style={{ color: DOME_GREEN }}>
              {indexProgress.current} / {indexProgress.total}
            </span>
          </div>
          <DomeProgressBar value={progressPercent} max={100} size="sm" variant="success" />
        </DomeCard>
      )}

      {/* Result */}
      {indexResult && !indexingMissing ? (
        <DomeCallout tone="success" icon={CheckCircle2}>
          {indexResult.indexed === 1
            ? t('settings.indexing.result_indexed_one', { count: indexResult.indexed })
            : t('settings.indexing.result_indexed_many', { count: indexResult.indexed })}
          {indexResult.failed > 0 ? t('settings.indexing.result_with_errors', { count: indexResult.failed }) : null}
        </DomeCallout>
      ) : null}

      {lastError ? <DomeCallout tone="error">{lastError}</DomeCallout> : null}

      {/* Actions */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.indexing.section_actions')}</DomeSectionLabel>
        <div className="flex flex-wrap gap-2">
          {pageIndexStatus?.unindexed === 0 && !indexingMissing && !indexResult ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs"
              style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}>
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: DOME_GREEN }} />
              {t('settings.indexing.all_indexed')}
            </div>
          ) : (
            <DomeButton
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleIndexMissing()}
              disabled={isBusy}
              leftIcon={
                indexingMissing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                ) : (
                  <BookOpen className="w-3.5 h-3.5" aria-hidden />
                )
              }
            >
              {indexingMissing
                ? t('settings.indexing.indexing_btn')
                : t('settings.indexing.index_pending', { count: pageIndexStatus?.unindexed ?? 0 })}
            </DomeButton>
          )}
          <DomeButton
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleReindexAll()}
            disabled={isBusy}
            leftIcon={
              reindexingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" aria-hidden />
              )
            }
          >
            {reindexingAll ? t('settings.indexing.reindexing') : t('settings.indexing.reindex_all')}
          </DomeButton>
        </div>
      </div>
    </div>
  );
}
