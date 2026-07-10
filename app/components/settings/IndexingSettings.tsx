import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle2, RefreshCw, Sparkles, Layers } from 'lucide-react';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import DomeProgressBar from '@/components/ui/DomeProgressBar';
import DomeCallout from '@/components/ui/DomeCallout';
import SettingsPanel from '@/components/settings/SettingsPanel';

const DOME_GREEN = 'var(--dome-accent)';

interface SemanticIndexingStatusPayload {
  modelVersion: string | null;
  configured?: boolean;
  dimensions?: number | null;
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

type TranslateFn = ReturnType<typeof useTranslation>['t'];

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function computeFullSyncPercent(progress: FullSyncProgressPayload | null): number {
  if (!progress || progress.resourcesTotal <= 0) return 0;
  if (progress.phase === 'finished') return 100;
  if (progress.phase === 'starting') return 0;
  return Math.min(100, Math.round((progress.resourceIndex / progress.resourcesTotal) * 100));
}

/** Embedding index status: initial load, 8s polling, and live progress events. */
function useEmbeddingStatus(pausePolling: boolean) {
  const [embedStatus, setEmbedStatus] = useState<SemanticIndexingStatusPayload | null>(null);
  const [embedLoading, setEmbedLoading] = useState(true);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [embedProgress, setEmbedProgress] = useState<{ done: number; total: number } | null>(null);

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
      setEmbedError(toErrorMessage(e));
    } finally {
      setEmbedLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmbedStatus();
    const interval = setInterval(() => {
      if (!pausePolling) void loadEmbedStatus();
    }, 8000);
    return () => clearInterval(interval);
  }, [loadEmbedStatus, pausePolling]);

  useEffect(() => {
    const off = window.electron.db.semantic.onProgress((p) => {
      setEmbedProgress({ done: p.done ?? 0, total: p.total ?? 0 });
    });
    return off;
  }, []);

  return {
    embedStatus,
    embedLoading,
    setEmbedLoading,
    embedError,
    setEmbedError,
    embedProgress,
    setEmbedProgress,
    loadEmbedStatus,
  };
}

/** Full library sync (cloud vision transcription + embeddings) with progress events. */
function useFullSync(loadEmbedStatus: () => Promise<void>, t: TranslateFn) {
  const [fullSyncBusy, setFullSyncBusy] = useState(false);
  const [fullSyncProgress, setFullSyncProgress] = useState<FullSyncProgressPayload | null>(null);
  const [fullSyncResult, setFullSyncResult] = useState<{
    totalResources: number;
    embeddingFailed: number;
  } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const progressCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const off = window.electron.on('indexing:full-sync-progress', (data: FullSyncProgressPayload) => {
      setFullSyncProgress(data);
      if (data.phase === 'finished') {
        setFullSyncBusy(false);
        void loadEmbedStatus();
      }
    });
    return () => {
      off?.();
    };
  }, [loadEmbedStatus]);

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
      setLastError(toErrorMessage(e));
    } finally {
      setFullSyncBusy(false);
      setFullSyncProgress(null);
      void loadEmbedStatus();
    }
  };

  return { fullSyncBusy, fullSyncProgress, fullSyncResult, lastError, handleFullSync };
}

interface EmbeddingReindexDeps {
  loadEmbedStatus: () => Promise<void>;
  setEmbedError: (e: string | null) => void;
  setEmbedProgress: (p: { done: number; total: number } | null) => void;
  t: TranslateFn;
}

/** Re-embed the whole library through the semantic index. */
function useSemanticReindex({ loadEmbedStatus, setEmbedError, setEmbedProgress, t }: EmbeddingReindexDeps) {
  const [embedReindexBusy, setEmbedReindexBusy] = useState(false);

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
      setEmbedError(toErrorMessage(e));
    } finally {
      setEmbedReindexBusy(false);
      setEmbedProgress(null);
      void loadEmbedStatus();
    }
  };

  return { embedReindexBusy, handleSemanticReindexAll };
}

function FullSyncSection({
  fullSyncBusy,
  fullSyncProgress,
  fullSyncResult,
  libraryBusy,
  onFullSync,
  t,
}: {
  fullSyncBusy: boolean;
  fullSyncProgress: FullSyncProgressPayload | null;
  fullSyncResult: { totalResources: number; embeddingFailed: number } | null;
  libraryBusy: boolean;
  onFullSync: () => Promise<void>;
  t: TranslateFn;
}) {
  const fullSyncPercent = computeFullSyncPercent(fullSyncProgress);
  return (
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
          onClick={() => void onFullSync()}
          leftIcon={
            fullSyncBusy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Layers className="size-4" aria-hidden />
            )
          }
        >
          {fullSyncBusy ? t('settings.indexing.full_sync_running') : t('settings.indexing.full_sync_btn')}
        </DomeButton>
      </DomeCard>
    </div>
  );
}

function EmbeddingsStatusBlock({
  embedStatus,
  embedProgress,
  embedReindexBusy,
  t,
}: {
  embedStatus: SemanticIndexingStatusPayload;
  embedProgress: { done: number; total: number } | null;
  embedReindexBusy: boolean;
  t: TranslateFn;
}) {
  return (
    <div className="mt-4 space-y-3">
      {embedStatus.modelVersion ? (
        <p className="text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
          <span className="font-medium" style={{ color: 'var(--dome-text-secondary)' }}>
            {t('settings.ai.embeddings.status.model_active')}:
          </span>{' '}
          <code className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--dome-surface)' }}>
            {embedStatus.modelVersion}
          </code>
          {embedStatus.dimensions != null ? (
            <span className="ml-2">
              ({embedStatus.dimensions} {t('settings.ai.embeddings.status.dimensions').toLowerCase()})
            </span>
          ) : null}
        </p>
      ) : null}

      {embedStatus.indexableTotal === 0 ? (
        <DomeCallout tone="info" icon={Sparkles}>
          {t('settings.embeddings.empty_library')}
        </DomeCallout>
      ) : (
        <>
          <div className="settings-stat-grid settings-stat-grid--4">
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
              <CheckCircle2 className="size-3.5 shrink-0" style={{ color: DOME_GREEN }} />
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
  );
}

function EmbeddingsSection({
  embedStatus,
  embedLoading,
  embedError,
  embedProgress,
  embedReindexBusy,
  libraryBusy,
  onRefresh,
  onReindexAll,
  t,
}: {
  embedStatus: SemanticIndexingStatusPayload | null;
  embedLoading: boolean;
  embedError: string | null;
  embedProgress: { done: number; total: number } | null;
  embedReindexBusy: boolean;
  libraryBusy: boolean;
  onRefresh: () => void;
  onReindexAll: () => Promise<void>;
  t: TranslateFn;
}) {
  return (
    <div className="pt-2 border-t" style={{ borderColor: 'var(--dome-border)' }}>
      <DomeSubpageHeader className={"!border-0 p-0 bg-transparent mt-2"}>
        <DomeSubpageHeader.Title>{t('settings.embeddings.section_title')}</DomeSubpageHeader.Title>
        <DomeSubpageHeader.Subtitle>{t('settings.embeddings.section_hint')}</DomeSubpageHeader.Subtitle>
      </DomeSubpageHeader>

      {embedStatus && embedStatus.configured === false && !embedLoading ? (
        <DomeCallout tone="warning" className="mt-3">
          {t('settings.ai.embeddings.status.not_configured')}
        </DomeCallout>
      ) : null}

      {embedLoading ? (
        <p className="text-xs mt-3 flex items-center gap-2" style={{ color: 'var(--dome-text-muted)' }}>
          <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden />
          {t('settings.embeddings.loading')}
        </p>
      ) : null}

      {embedError ? <DomeCallout tone="error" className="mt-3">{embedError}</DomeCallout> : null}

      {embedStatus && !embedLoading ? (
        <EmbeddingsStatusBlock
          embedStatus={embedStatus}
          embedProgress={embedProgress}
          embedReindexBusy={embedReindexBusy}
          t={t}
        />
      ) : null}

      {!embedLoading ? (
        <div className="flex flex-wrap gap-2 mt-4">
          <DomeButton
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={libraryBusy}
            leftIcon={<RefreshCw className="size-3.5" aria-hidden />}
          >
            {t('settings.embeddings.refresh')}
          </DomeButton>
          <DomeButton
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void onReindexAll()}
            disabled={libraryBusy}
            leftIcon={
              embedReindexBusy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-3.5" aria-hidden />
              )
            }
          >
            {embedReindexBusy ? t('settings.embeddings.reindexing') : t('settings.embeddings.reindex')}
          </DomeButton>
        </div>
      ) : null}
    </div>
  );
}

export default function IndexingSettings() {
  const { t } = useTranslation();
  const [pausePolling, setPausePolling] = useState(false);

  const {
    embedStatus,
    embedLoading,
    setEmbedLoading,
    embedError,
    setEmbedError,
    embedProgress,
    setEmbedProgress,
    loadEmbedStatus,
  } = useEmbeddingStatus(pausePolling);

  const { fullSyncBusy, fullSyncProgress, fullSyncResult, lastError, handleFullSync } = useFullSync(
    loadEmbedStatus,
    t,
  );

  const { embedReindexBusy, handleSemanticReindexAll } = useSemanticReindex({
    loadEmbedStatus,
    setEmbedError,
    setEmbedProgress,
    t,
  });

  const libraryBusy = fullSyncBusy || embedReindexBusy;

  // Pause the 8s status poll while a bulk operation runs (matches the
  // original `!embedReindexBusy && !fullSyncBusy` polling guard).
  useEffect(() => {
    setPausePolling(libraryBusy);
  }, [libraryBusy]);

  const handleRefresh = () => {
    setEmbedLoading(true);
    void loadEmbedStatus();
  };

  return (
    <SettingsPanel>
      <DomeSubpageHeader className={"!border-0 p-0 bg-transparent"}>
        <DomeSubpageHeader.Title>{t('settings.indexing.title')}</DomeSubpageHeader.Title>
        <DomeSubpageHeader.Subtitle>{t('settings.indexing.subtitle')}</DomeSubpageHeader.Subtitle>
      </DomeSubpageHeader>

      {/* Full library index (cloud vision transcription + Nomic embeddings) */}
      <FullSyncSection
        fullSyncBusy={fullSyncBusy}
        fullSyncProgress={fullSyncProgress}
        fullSyncResult={fullSyncResult}
        libraryBusy={libraryBusy}
        onFullSync={handleFullSync}
        t={t}
      />

      <DomeSectionLabel className="font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">
        {t('settings.indexing.section_separate')}
      </DomeSectionLabel>

      <EmbeddingsSection
        embedStatus={embedStatus}
        embedLoading={embedLoading}
        embedError={embedError}
        embedProgress={embedProgress}
        embedReindexBusy={embedReindexBusy}
        libraryBusy={libraryBusy}
        onRefresh={handleRefresh}
        onReindexAll={handleSemanticReindexAll}
        t={t}
      />

      {lastError ? <DomeCallout tone="error">{lastError}</DomeCallout> : null}
    </SettingsPanel>
  );
}
