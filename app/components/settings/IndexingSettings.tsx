import { HugeiconsIcon } from '@hugeicons/react';
import {
  Loading03Icon as Loader2,
  CheckmarkCircle02Icon as CheckCircle2,
  RefreshIcon as RefreshCw,
  SparklesIcon as Sparkles,
  Layers01Icon as Layers,
  AlertCircleIcon as AlertCircle,
  Alert02Icon as AlertTriangle,
} from '@hugeicons/core-free-icons';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

import SubpageHeader from '@/components/shared/SubpageHeader';
import SettingsPanel from '@/components/settings/SettingsPanel';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
const DOME_GREEN = 'var(--primary)';

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
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">
        {t('settings.indexing.full_sync_section')}
      </p>
      <Card className="p-4 p-4 flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {t('settings.indexing.full_sync_title')}
          </p>
          <p className="text-xs mt-1 leading-relaxed text-muted-foreground">
            {t('settings.indexing.full_sync_hint')}
          </p>
        </div>
        {fullSyncProgress &&
        fullSyncProgress.phase !== 'finished' &&
        fullSyncProgress.resourcesTotal > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">
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
              <span className="shrink-0 font-medium text-primary">
                {fullSyncPercent}%
              </span>
            </div>
            <Progress value={fullSyncPercent} className="h-1.5" />
          </div>
        ) : null}
        {fullSyncResult && !fullSyncBusy ? (
          <Alert role="note">
            <HugeiconsIcon icon={CheckCircle2} aria-hidden />
            <AlertDescription className="text-xs">
              {t('settings.indexing.full_sync_done')}
              {fullSyncResult.totalResources > 0 && fullSyncResult.embeddingFailed > 0
                ? ` ${t('settings.indexing.full_sync_summary_errors', { emb: fullSyncResult.embeddingFailed })}`
                : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <Button type="button"
  disabled={libraryBusy}
  onClick={() => void onFullSync()}>{
            fullSyncBusy ? (
              <HugeiconsIcon icon={Loader2} className="size-4 animate-spin" aria-hidden />
            ) : (
              <HugeiconsIcon icon={Layers} className="size-4" aria-hidden />
            )
          }
          {fullSyncBusy ? t('settings.indexing.full_sync_running') : t('settings.indexing.full_sync_btn')}
        </Button>
      </Card>
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
    <div className="mt-4 flex flex-col gap-3">
      {embedStatus.modelVersion ? (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-muted-foreground">
            {t('settings.ai.embeddings.status.model_active')}:
          </span>{' '}
          <code className="text-[10px] px-1 py-0.5 rounded bg-card">
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
        <Alert role="note"><HugeiconsIcon icon={Sparkles} aria-hidden /><AlertDescription className="text-xs">
          {t('settings.embeddings.empty_library')}
        </AlertDescription></Alert>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4">
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
              <Card className="p-4 p-4" key={label}>
                <p className={cn('text-2xl font-bold', color === 'var(--warning)' ? 'text-[var(--warning)]' : 'text-primary')}>
                  {value}
                </p>
                <p className="text-xs mt-0.5 text-muted-foreground">
                  {label}
                </p>
              </Card>
            ))}
          </div>

          {embedStatus.allIndexed ? (
            <div
              className="flex w-fit items-center gap-2 rounded-lg border bg-card px-4 py-2 text-xs text-muted-foreground"
            >
              <HugeiconsIcon icon={CheckCircle2} className="size-3.5 shrink-0 text-primary" />
              {t('settings.embeddings.all_indexed')}
            </div>
          ) : (
            <Alert role="note"><HugeiconsIcon icon={Sparkles} aria-hidden /><AlertDescription className="text-xs">
              {t('settings.embeddings.pending_label', { count: embedStatus.pendingCount })}
            </AlertDescription></Alert>
          )}
        </>
      )}

      {embedProgress && embedProgress.total > 0 && embedReindexBusy ? (
        <p className="text-xs text-muted-foreground">
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
    <div className="pt-2 border-t border-border">
      <SubpageHeader className={"!border-0 p-0 bg-transparent mt-2"}>
        <SubpageHeader.Title>{t('settings.embeddings.section_title')}</SubpageHeader.Title>
        <SubpageHeader.Subtitle>{t('settings.embeddings.section_hint')}</SubpageHeader.Subtitle>
      </SubpageHeader>

      {embedStatus && embedStatus.configured === false && !embedLoading ? (
        <Alert className="mt-3" role="note"><HugeiconsIcon icon={AlertTriangle} aria-hidden /><AlertDescription className="text-xs">
          {t('settings.ai.embeddings.status.not_configured')}
        </AlertDescription></Alert>
      ) : null}

      {embedLoading ? (
        <p className="text-xs mt-3 flex items-center gap-2 text-muted-foreground">
          <HugeiconsIcon icon={Loader2} className="size-3.5 animate-spin shrink-0" aria-hidden />
          {t('settings.embeddings.loading')}
        </p>
      ) : null}

      {embedError ? <Alert variant="destructive" className="mt-3" role="note"><HugeiconsIcon icon={AlertCircle} aria-hidden /><AlertDescription className="text-xs">{embedError}</AlertDescription></Alert> : null}

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
          <Button type="button"
  variant="outline"
  onClick={onRefresh}
  disabled={libraryBusy}
  size="sm">{<HugeiconsIcon icon={RefreshCw} className="size-3.5" aria-hidden />}
            {t('settings.embeddings.refresh')}
          </Button>
          <Button type="button"
  onClick={() => void onReindexAll()}
  disabled={libraryBusy}
  size="sm">{
              embedReindexBusy ? (
                <HugeiconsIcon icon={Loader2} className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <HugeiconsIcon icon={Sparkles} className="size-3.5" aria-hidden />
              )
            }
            {embedReindexBusy ? t('settings.embeddings.reindexing') : t('settings.embeddings.reindex')}
          </Button>
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
      <SubpageHeader className={"!border-0 p-0 bg-transparent"}>
        <SubpageHeader.Title>{t('settings.indexing.title')}</SubpageHeader.Title>
        <SubpageHeader.Subtitle>{t('settings.indexing.subtitle')}</SubpageHeader.Subtitle>
      </SubpageHeader>

      {/* Full library index (cloud vision transcription + Nomic embeddings) */}
      <FullSyncSection
        fullSyncBusy={fullSyncBusy}
        fullSyncProgress={fullSyncProgress}
        fullSyncResult={fullSyncResult}
        libraryBusy={libraryBusy}
        onFullSync={handleFullSync}
        t={t}
      />

      <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">
        {t('settings.indexing.section_separate')}
      </p>

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

      {lastError ? <Alert variant="destructive" role="note"><HugeiconsIcon icon={AlertCircle} aria-hidden /><AlertDescription className="text-xs">{lastError}</AlertDescription></Alert> : null}
    </SettingsPanel>
  );
}
