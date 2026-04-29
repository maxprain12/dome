import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle2, RefreshCw, Sparkles, Layers } from 'lucide-react';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import DomeProgressBar from '@/components/ui/DomeProgressBar';
import DomeCallout from '@/components/ui/DomeCallout';

const DOME_GREEN = 'var(--dome-accent)';

interface SemanticIndexingStatusPayload {
  modelVersion: string;
  indexableTotal: number;
  indexedResourceCount: number;
  pendingCount: number;
  chunksTotal: number;
  allIndexed: boolean;
}

interface FullSyncProgressPayload {
  phase: 'starting' | 'embeddings' | 'finished';
  resourceIndex: number;
  resourcesTotal: number;
  resourceId?: string;
  title?: string | null;
  embeddingFailed?: number;
}

export default function IndexingSettings() {
  const { t } = useTranslation();
  const [embedStatus, setEmbedStatus] = useState<SemanticIndexingStatusPayload | null>(null);
  const [embedLoading, setEmbedLoading] = useState(true);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [embedReindexBusy, setEmbedReindexBusy] = useState(false);
  const [embedProgress, setEmbedProgress] = useState<{ done: number; total: number } | null>(null);

  const [fullSyncBusy, setFullSyncBusy] = useState(false);
  const [fullSyncProgress, setFullSyncProgress] = useState<FullSyncProgressPayload | null>(null);
  const [fullSyncResult, setFullSyncResult] = useState<{
    totalResources: number;
    embeddingFailed: number;
  } | null>(null);

  const [lastError, setLastError] = useState<string | null>(null);
  const progressCleanupRef = useRef<(() => void) | null>(null);

  const loadEmbedStatus = useCallback(async () => {
    setEmbedError(null);
    try {
      const r = await window.electron.db.semantic.getIndexingStatus();
      if (r.success && r.data) {
        setEmbedStatus(r.data);
      } else {
        setEmbedStatus(null);
        setEmbedError(r.error || null);
      }
    } catch (e) {
      setEmbedStatus(null);
      setEmbedError(e instanceof Error ? e.message : String(e));
    } finally {
      setEmbedLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmbedStatus();
    const interval = setInterval(() => {
      if (!embedReindexBusy && !fullSyncBusy) void loadEmbedStatus();
    }, 8000);
    return () => clearInterval(interval);
  }, [loadEmbedStatus, embedReindexBusy, fullSyncBusy]);

  useEffect(() => {
    const off = window.electron.db.semantic.onProgress((p) => {
      setEmbedProgress({ done: p.done ?? 0, total: p.total ?? 0 });
    });
    return off;
  }, []);

  useEffect(() => {
    const off = window.electron.on('indexing:full-sync-progress', (data: FullSyncProgressPayload) => {
      setFullSyncProgress(data);
      if (data.phase === 'finished') {
        setFullSyncBusy(false);
        void loadEmbedStatus();
      }
    });
    return off;
  }, [loadEmbedStatus]);

  const fullSyncPercent =
    fullSyncProgress && fullSyncProgress.resourcesTotal > 0
      ? fullSyncProgress.phase === 'finished'
        ? 100
        : fullSyncProgress.phase === 'starting'
          ? 0
          : Math.min(
              100,
              Math.round((fullSyncProgress.resourceIndex / fullSyncProgress.resourcesTotal) * 100),
            )
      : 0;

  const handleFullSync = async () => {
    setFullSyncBusy(true);
    setFullSyncResult(null);
    setFullSyncProgress(null);
    setLastError(null);
    if (progressCleanupRef.current) progressCleanupRef.current();
    try {
      const r = await window.electron.invoke('indexing:full-sync');
      if (r?.success) {
        setFullSyncResult({
          totalResources: r.totalResources ?? 0,
          embeddingFailed: r.embeddingFailed ?? 0,
        });
      } else {
        setLastError(r?.error || t('settings.indexing.error_index_failed'));
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setFullSyncBusy(false);
      setFullSyncProgress(null);
      void loadEmbedStatus();
    }
  };

  const handleSemanticReindexAll = async () => {
    setEmbedReindexBusy(true);
    setEmbedProgress(null);
    setEmbedError(null);
    try {
      const r = await window.electron.db.semantic.reindexAll();
      if (!r.success) {
        setEmbedError(r.error || t('settings.embeddings.error_load'));
      }
    } catch (e) {
      setEmbedError(e instanceof Error ? e.message : String(e));
    } finally {
      setEmbedReindexBusy(false);
      setEmbedProgress(null);
      void loadEmbedStatus();
    }
  };

  const libraryBusy = fullSyncBusy || embedReindexBusy;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <DomeSubpageHeader
        className="!border-0 px-0 py-0 bg-transparent"
        title={t('settings.indexing.title')}
        subtitle={t('settings.indexing.subtitle')}
      />

      {/* Full library index (cloud vision transcription + Nomic embeddings) */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">
          {t('settings.indexing.full_sync_section')}
        </DomeSectionLabel>
        <DomeCard className="p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
              {t('settings.indexing.full_sync_title')}
            </p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
              {t('settings.indexing.full_sync_hint')}
            </p>
          </div>
          {fullSyncProgress &&
          fullSyncProgress.phase !== 'finished' &&
          fullSyncProgress.resourcesTotal > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate" style={{ color: 'var(--dome-text-muted)' }}>
                  {fullSyncProgress.phase === 'embeddings'
                    ? t('settings.indexing.full_sync_phase_embeddings')
                    : '…'}
                  {fullSyncProgress.title
                    ? ` · ${t('settings.indexing.full_sync_progress_res', {
                        current: fullSyncProgress.resourceIndex,
                        total: fullSyncProgress.resourcesTotal,
                        title: fullSyncProgress.title,
                      })}`
                    : null}
                </span>
                <span className="shrink-0 font-medium" style={{ color: DOME_GREEN }}>
                  {fullSyncPercent}%
                </span>
              </div>
              <DomeProgressBar value={fullSyncPercent} max={100} size="sm" variant="success" />
            </div>
          ) : null}
          {fullSyncResult && !fullSyncBusy ? (
            <DomeCallout
              tone={fullSyncResult.embeddingFailed > 0 ? 'warning' : 'success'}
              icon={CheckCircle2}
            >
              {t('settings.indexing.full_sync_done')}
              {fullSyncResult.totalResources > 0 && fullSyncResult.embeddingFailed > 0
                ? ` ${t('settings.indexing.full_sync_summary_errors', { emb: fullSyncResult.embeddingFailed })}`
                : null}
            </DomeCallout>
          ) : null}
          <DomeButton
            type="button"
            variant="primary"
            size="md"
            disabled={libraryBusy}
            onClick={() => void handleFullSync()}
            leftIcon={
              fullSyncBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              ) : (
                <Layers className="w-4 h-4" aria-hidden />
              )
            }
          >
            {fullSyncBusy ? t('settings.indexing.full_sync_running') : t('settings.indexing.full_sync_btn')}
          </DomeButton>
        </DomeCard>
      </div>

      <DomeSectionLabel className="font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">
        {t('settings.indexing.section_separate')}
      </DomeSectionLabel>

      {/* Embeddings locales (Nomic / resource_chunks) */}
      <div className="pt-2 border-t" style={{ borderColor: 'var(--dome-border)' }}>
        <DomeSubpageHeader
          className="!border-0 px-0 py-0 bg-transparent mt-2"
          title={t('settings.embeddings.section_title')}
          subtitle={t('settings.embeddings.section_hint')}
        />

        {embedLoading ? (
          <p className="text-xs mt-3 flex items-center gap-2" style={{ color: 'var(--dome-text-muted)' }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden />
            {t('settings.embeddings.loading')}
          </p>
        ) : null}

        {embedError ? <DomeCallout tone="error" className="mt-3">{embedError}</DomeCallout> : null}

        {embedStatus && !embedLoading ? (
          <div className="mt-4 space-y-3">
            <p className="text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
              <span className="font-medium" style={{ color: 'var(--dome-text-secondary)' }}>
                {t('settings.embeddings.model')}:
              </span>{' '}
              <code className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--dome-surface)' }}>
                {embedStatus.modelVersion}
              </code>
            </p>

            {embedStatus.indexableTotal === 0 ? (
              <DomeCallout tone="info" icon={Sparkles}>
                {t('settings.embeddings.empty_library')}
              </DomeCallout>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: t('settings.embeddings.total'), value: embedStatus.indexableTotal, color: DOME_GREEN },
                    {
                      label: t('settings.embeddings.indexed'),
                      value: embedStatus.indexedResourceCount,
                      color: DOME_GREEN,
                    },
                    {
                      label: t('settings.embeddings.pending'),
                      value: embedStatus.pendingCount,
                      color: embedStatus.pendingCount > 0 ? 'var(--warning)' : DOME_GREEN,
                    },
                    { label: t('settings.embeddings.chunks'), value: embedStatus.chunksTotal, color: DOME_GREEN },
                  ].map(({ label, value, color }) => (
                    <DomeCard key={label} className="p-4">
                      <p className="text-2xl font-bold" style={{ color }}>
                        {value}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                        {label}
                      </p>
                    </DomeCard>
                  ))}
                </div>

                {embedStatus.allIndexed ? (
                  <div
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs w-fit"
                    style={{
                      backgroundColor: 'var(--dome-surface)',
                      border: '1px solid var(--dome-border)',
                      color: 'var(--dome-text-muted)',
                    }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: DOME_GREEN }} />
                    {t('settings.embeddings.all_indexed')}
                  </div>
                ) : (
                  <DomeCallout tone="warning" icon={Sparkles}>
                    {t('settings.embeddings.pending_label', { count: embedStatus.pendingCount })}
                  </DomeCallout>
                )}
              </>
            )}

            {embedProgress && embedProgress.total > 0 && embedReindexBusy ? (
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.embeddings.progress', {
                  done: embedProgress.done,
                  total: embedProgress.total,
                })}
              </p>
            ) : null}
          </div>
        ) : null}

        {!embedLoading ? (
          <div className="flex flex-wrap gap-2 mt-4">
            <DomeButton
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEmbedLoading(true);
                void loadEmbedStatus();
              }}
              disabled={libraryBusy}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden />}
            >
              {t('settings.embeddings.refresh')}
            </DomeButton>
            <DomeButton
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleSemanticReindexAll()}
              disabled={libraryBusy}
              leftIcon={
                embedReindexBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" aria-hidden />
                )
              }
            >
              {embedReindexBusy ? t('settings.embeddings.reindexing') : t('settings.embeddings.reindex')}
            </DomeButton>
          </div>
        ) : null}
      </div>

      {lastError ? <DomeCallout tone="error">{lastError}</DomeCallout> : null}
    </div>
  );
}
