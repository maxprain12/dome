'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, CheckCircle2, AlertCircle, BookOpen, RefreshCw } from 'lucide-react';

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
  resourceId?: string;
  title?: string;
  status: 'starting' | 'indexing' | 'done' | 'error' | 'skipped' | 'finished';
  indexed?: number;
  failed?: number;
}

export default function IndexingSettings() {
  const [pageIndexStatus, setPageIndexStatus] = useState<PageIndexStatus | null>(null);
  const [indexingMissing, setIndexingMissing] = useState(false);
  const [reindexingAll, setReindexingAll] = useState(false);
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
  const [indexResult, setIndexResult] = useState<{ indexed: number; failed: number; total: number } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const progressCleanupRef = useRef<(() => void) | null>(null);

  const loadPageIndexStatus = useCallback(async () => {
    try {
      const s = await window.electron?.invoke?.('pageindex:status');
      setPageIndexStatus(s ?? null);
    } catch {
      setPageIndexStatus(null);
    }
  }, []);

  useEffect(() => {
    loadPageIndexStatus();
    const interval = setInterval(() => {
      if (!indexingMissing) loadPageIndexStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadPageIndexStatus, indexingMissing]);

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
        loadPageIndexStatus();
        if (progressCleanupRef.current) {
          progressCleanupRef.current();
          progressCleanupRef.current = null;
        }
      }
    });
    progressCleanupRef.current = cleanup ?? null;

    try {
      const result = await window.electron?.invoke?.('pageindex:index-missing');
      if (!result?.success) {
        setLastError(result?.error || 'Error al indexar');
        setIndexingMissing(false);
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      setIndexingMissing(false);
    } finally {
      if (progressCleanupRef.current) {
        progressCleanupRef.current();
        progressCleanupRef.current = null;
      }
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
        loadPageIndexStatus();
      } else {
        setLastError(result?.error || 'Error al reindexar');
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setReindexingAll(false);
    }
  };

  const progressPercent = indexProgress && indexProgress.total > 0
    ? Math.round((indexProgress.current / indexProgress.total) * 100)
    : 0;

  const lastIndexedDate = pageIndexStatus?.last_indexed_at
    ? new Date(pageIndexStatus.last_indexed_at).toLocaleString()
    : null;

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div>
        <h2 className="text-xl font-display font-semibold mb-1" style={{ color: 'var(--primary-text)' }}>
          Indexación de documentos
        </h2>
        <p className="text-sm opacity-80" style={{ color: 'var(--secondary-text)' }}>
          Gestiona el índice de documentos para búsqueda e IA
        </p>
      </div>

      {/* Stats */}
      {pageIndexStatus?.success && (
        <section>
          <h3 className="text-xs uppercase tracking-wider font-semibold mb-6" style={{ color: 'var(--secondary-text)' }}>
            Estado
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <p className="text-2xl font-semibold" style={{ color: 'var(--accent)' }}>
                {pageIndexStatus.total_indexable}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--secondary-text)' }}>Documentos totales</p>
            </div>
            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <p className="text-2xl font-semibold" style={{ color: '#22c55e' }}>
                {pageIndexStatus.indexed_documents}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--secondary-text)' }}>Indexados</p>
            </div>
            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <p className="text-2xl font-semibold" style={{ color: pageIndexStatus.unindexed > 0 ? '#f59e0b' : '#22c55e' }}>
                {pageIndexStatus.unindexed}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--secondary-text)' }}>Pendientes</p>
            </div>
          </div>
          {lastIndexedDate && (
            <p className="text-xs mt-3" style={{ color: 'var(--tertiary-text)' }}>
              Última indexación: {lastIndexedDate}
            </p>
          )}
        </section>
      )}

      {/* Acción */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6" style={{ color: 'var(--secondary-text)' }}>
          Acciones
        </h3>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {/* Indexar pendientes */}
            {pageIndexStatus?.unindexed === 0 && !indexingMissing && !indexResult ? (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--secondary-text)' }}>
                <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
                Todos los documentos están indexados
              </div>
            ) : (
              <button
                type="button"
                onClick={handleIndexMissing}
                disabled={indexingMissing || reindexingAll}
                className="btn btn-primary flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {indexingMissing
                  ? <Loader2 size={16} className="animate-spin" />
                  : <BookOpen size={16} />}
                {indexingMissing
                  ? 'Indexando…'
                  : `Indexar ${pageIndexStatus?.unindexed ?? ''} pendientes`}
              </button>
            )}

            {/* Reindexar todo */}
            <button
              type="button"
              onClick={handleReindexAll}
              disabled={indexingMissing || reindexingAll}
              className="btn btn-secondary flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {reindexingAll
                ? <Loader2 size={16} className="animate-spin" />
                : <RefreshCw size={16} />}
              {reindexingAll ? 'Reindexando…' : 'Reindexar todos'}
            </button>
          </div>

          {/* Barra de progreso */}
          {indexingMissing && indexProgress && indexProgress.total > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs" style={{ color: 'var(--secondary-text)' }}>
                <span className="truncate max-w-xs">
                  {indexProgress.status === 'indexing' && indexProgress.title
                    ? `Indexando: ${indexProgress.title}`
                    : 'Preparando…'}
                </span>
                <span>{indexProgress.current} / {indexProgress.total}</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%`, backgroundColor: 'var(--accent)' }}
                />
              </div>
            </div>
          )}

          {/* Resultado */}
          {indexResult && !indexingMissing && (
            <div className="p-4 rounded-lg flex items-center gap-2"
              style={{ backgroundColor: '#22c55e18', border: '1px solid #22c55e' }}>
              <CheckCircle2 size={18} style={{ color: '#22c55e' }} />
              <span className="text-sm" style={{ color: 'var(--primary-text)' }}>
                {indexResult.indexed} {indexResult.indexed === 1 ? 'documento indexado' : 'documentos indexados'} correctamente
                {indexResult.failed > 0 && `, ${indexResult.failed} con errores`}
              </span>
            </div>
          )}

          {lastError && (
            <div className="p-4 rounded-lg flex items-center gap-2" style={{ backgroundColor: 'var(--error)18', border: '1px solid var(--error)' }}>
              <AlertCircle size={18} style={{ color: 'var(--error)' }} />
              <span className="text-sm" style={{ color: 'var(--error)' }}>{lastError}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
