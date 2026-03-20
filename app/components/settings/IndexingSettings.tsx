import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle2, AlertCircle, BookOpen, RefreshCw } from 'lucide-react';

const DOME_GREEN = '#596037';
const DOME_GREEN_LIGHT = '#E0EAB4';

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
      {children}
    </p>
  );
}

function SettingsCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl ${className}`} style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
      {children}
    </div>
  );
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
      if (!result?.success) { setLastError(result?.error || 'Error al indexar'); setIndexingMissing(false); }
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
      } else { setLastError(result?.error || 'Error al reindexar'); }
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
      <div>
        <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--dome-text)' }}>{t('settings.indexing.title')}</h2>
        <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{t('settings.indexing.description')}</p>
      </div>

      {/* Stats */}
      {pageIndexStatus?.success && (
        <div>
          <SectionLabel>{t('settings.indexing.section_status')}</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: t('settings.indexing.total'), value: pageIndexStatus.total_indexable, color: DOME_GREEN },
              { label: t('settings.indexing.indexed'), value: pageIndexStatus.indexed_documents, color: DOME_GREEN },
              { label: t('settings.indexing.pending'), value: pageIndexStatus.unindexed, color: pageIndexStatus.unindexed > 0 ? '#a37b00' : DOME_GREEN },
            ].map(({ label, value, color }) => (
              <SettingsCard key={label} className="p-4">
                <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>{label}</p>
              </SettingsCard>
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
        <SettingsCard className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs truncate max-w-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {indexProgress.status === 'indexing' && indexProgress.title ? `${t('settings.indexing.progress_indexing')}: ${indexProgress.title}` : t('settings.indexing.progress_preparing')}
            </p>
            <span className="text-xs font-medium" style={{ color: DOME_GREEN }}>
              {indexProgress.current} / {indexProgress.total}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--dome-border)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPercent}%`, backgroundColor: DOME_GREEN }} />
          </div>
        </SettingsCard>
      )}

      {/* Result */}
      {indexResult && !indexingMissing && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
          style={{ backgroundColor: `${DOME_GREEN}12`, border: `1px solid ${DOME_GREEN}30`, color: DOME_GREEN }}>
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {indexResult.indexed} {indexResult.indexed === 1 ? t('settings.indexing.result_indexed_one') : t('settings.indexing.result_indexed_many')}
          {indexResult.failed > 0 && `, ${indexResult.failed} ${t('settings.indexing.result_with_errors')}`}
        </div>
      )}

      {lastError && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--dome-error, #ef4444)' }}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {lastError}
        </div>
      )}

      {/* Actions */}
      <div>
        <SectionLabel>{t('settings.indexing.section_actions')}</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {pageIndexStatus?.unindexed === 0 && !indexingMissing && !indexResult ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs"
              style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}>
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: DOME_GREEN }} />
              {t('settings.indexing.all_indexed')}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleIndexMissing}
              disabled={isBusy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-50"
              style={{ backgroundColor: DOME_GREEN }}
            >
              {indexingMissing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
              {indexingMissing ? t('settings.indexing.indexing_btn') : `${t('settings.indexing.index_pending')} ${pageIndexStatus?.unindexed ?? ''}`}
            </button>
          )}
          <button
            type="button"
            onClick={handleReindexAll}
            disabled={isBusy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
            style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
          >
            {reindexingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {reindexingAll ? t('settings.indexing.reindexing') : t('settings.indexing.reindex_all')}
          </button>
        </div>
      </div>
    </div>
  );
}
