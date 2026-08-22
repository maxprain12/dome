import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  DatabaseIcon,
  Layers01Icon,
  RefreshIcon,
  SparklesIcon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import { cn } from '@/lib/utils';

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

/** Phase + optional resource title for the full-sync progress line — extracted for S3776. */
function fullSyncProgressLabel(progress: FullSyncProgressPayload, t: TranslateFn): string {
  const phase =
    progress.phase === 'embeddings' ? t('settings.indexing.full_sync_phase_embeddings') : '…';
  if (!progress.title) return phase;
  return `${phase} · ${t('settings.indexing.full_sync_progress_res', {
    current: progress.resourceIndex,
    total: progress.resourcesTotal,
    title: progress.title,
  })}`;
}

/** Optional embedding-error suffix after a successful full sync — extracted for S3776. */
function fullSyncDoneErrorSuffix(
  result: { totalResources: number; embeddingFailed: number },
  t: TranslateFn,
): string | null {
  if (result.totalResources <= 0 || result.embeddingFailed <= 0) return null;
  return ` ${t('settings.indexing.full_sync_summary_errors', { emb: result.embeddingFailed })}`;
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

  useEffect(() => { loadEmbedStatus();
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
        setFullSyncBusy(false); loadEmbedStatus();
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
      setFullSyncProgress(null); loadEmbedStatus();
    }
  };

  return { fullSyncBusy, fullSyncProgress, fullSyncResult, lastError, handleFullSync };
}

/** Re-embed the whole library through the semantic index. */
function useSemanticReindex({
  loadEmbedStatus,
  setEmbedError,
  setEmbedProgress,
  t,
}: {
  loadEmbedStatus: () => Promise<void>;
  setEmbedError: (e: string | null) => void;
  setEmbedProgress: (p: { done: number; total: number } | null) => void;
  t: TranslateFn;
}) {
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
      setEmbedProgress(null); loadEmbedStatus();
    }
  };

  return { embedReindexBusy, handleSemanticReindexAll };
}

/** Full-sync trigger button — extracted for S3776. */
function FullSyncButton({
  busy,
  libraryBusy,
  onFullSync,
}: {
  busy: boolean;
  libraryBusy: boolean;
  onFullSync: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Button type="button" size="sm" disabled={libraryBusy} onClick={onFullSync}>
      {busy ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <HugeiconsIcon icon={Layers01Icon} data-icon="inline-start" />
      )}
      {busy ? t('settings.indexing.full_sync_running') : t('settings.indexing.full_sync_btn')}
    </Button>
  );
}

/** In-progress full-sync bar — extracted for S3776. */
function FullSyncProgressBlock({
  progress,
  percent,
}: {
  progress: FullSyncProgressPayload | null;
  percent: number;
}) {
  const { t } = useTranslation();
  if (!progress || progress.phase === 'finished' || progress.resourcesTotal <= 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-muted-foreground">{fullSyncProgressLabel(progress, t)}</span>
        <span className="shrink-0 font-medium text-primary">{percent}%</span>
      </div>
      <Progress value={percent} className="h-1.5" />
    </div>
  );
}

/** Post full-sync success note — extracted for S3776. */
function FullSyncDoneAlert({
  result,
  busy,
}: {
  result: { totalResources: number; embeddingFailed: number } | null;
  busy: boolean;
}) {
  const { t } = useTranslation();
  if (!result || busy) return null;
  return (
    <Alert role="note">
      <HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden />
      <AlertDescription className="text-xs">
        {t('settings.indexing.full_sync_done')}
        {fullSyncDoneErrorSuffix(result, t)}
      </AlertDescription>
    </Alert>
  );
}

/** Refresh + reindex actions for the embeddings group — extracted for S3776. */
function EmbeddingsGroupActions({
  libraryBusy,
  embedReindexBusy,
  onRefresh,
  onReindex,
}: {
  libraryBusy: boolean;
  embedReindexBusy: boolean;
  onRefresh: () => void;
  onReindex: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={libraryBusy}>
        <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
        {t('settings.embeddings.refresh')}
      </Button>
      <Button type="button" size="sm" onClick={onReindex} disabled={libraryBusy}>
        {embedReindexBusy ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />
        )}
        {embedReindexBusy
          ? t('settings.embeddings.reindexing')
          : t('settings.embeddings.reindex')}
      </Button>
    </>
  );
}

/** Active model / dimensions line — extracted for S3776. */
function EmbeddingModelMeta({ status }: { status: SemanticIndexingStatusPayload }) {
  const { t } = useTranslation();
  if (!status.modelVersion) return null;
  return (
    <p className="text-[11px] text-muted-foreground">
      <span className="font-medium">{t('settings.ai.embeddings.status.model_active')}:</span>{' '}
      <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{status.modelVersion}</code>
      {status.dimensions != null ? (
        <span className="ml-2">
          ({status.dimensions} {t('settings.ai.embeddings.status.dimensions').toLowerCase()})
        </span>
      ) : null}
    </p>
  );
}

/** Stat cards for indexable / indexed / pending / chunks — extracted for S3776. */
function EmbeddingStatsGrid({ status }: { status: SemanticIndexingStatusPayload }) {
  const { t } = useTranslation();
  const cells = [
    { label: t('settings.embeddings.total'), value: status.indexableTotal, warning: false },
    { label: t('settings.embeddings.indexed'), value: status.indexedResourceCount, warning: false },
    {
      label: t('settings.embeddings.pending'),
      value: status.pendingCount,
      warning: status.pendingCount > 0,
    },
    { label: t('settings.embeddings.chunks'), value: status.chunksTotal, warning: false },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {cells.map(({ label, value, warning }) => (
        <div key={label} className="rounded-lg border bg-background p-3">
          <p
            className={cn(
              'text-2xl font-bold tabular-nums',
              warning ? 'text-warning' : 'text-primary',
            )}
          >
            {value}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}

/** Empty library / stats / coverage alerts — extracted for S3776. */
function EmbeddingLibraryBody({ status }: { status: SemanticIndexingStatusPayload }) {
  const { t } = useTranslation();
  if (status.indexableTotal === 0) {
    return (
      <Alert role="note">
        <HugeiconsIcon icon={SparklesIcon} aria-hidden />
        <AlertDescription className="text-xs">{t('settings.embeddings.empty_library')}</AlertDescription>
      </Alert>
    );
  }
  return (
    <>
      <EmbeddingStatsGrid status={status} />
      {status.allIndexed ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="shrink-0 text-primary" />
          {t('settings.embeddings.all_indexed')}
        </p>
      ) : (
        <Alert role="note">
          <HugeiconsIcon icon={SparklesIcon} aria-hidden />
          <AlertDescription className="text-xs">
            {t('settings.embeddings.pending_label', { count: status.pendingCount })}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

/** Embeddings status panel body — extracted for S3776. */
function EmbeddingsStatusPanel({
  embedStatus,
  embedLoading,
  embedError,
  embedProgress,
  embedReindexBusy,
}: {
  embedStatus: SemanticIndexingStatusPayload | null;
  embedLoading: boolean;
  embedError: string | null;
  embedProgress: { done: number; total: number } | null;
  embedReindexBusy: boolean;
}) {
  const { t } = useTranslation();
  const showNotConfigured = Boolean(embedStatus && embedStatus.configured === false && !embedLoading);
  const showStatus = Boolean(embedStatus && !embedLoading);
  const showReindexProgress = Boolean(
    embedProgress && embedProgress.total > 0 && embedReindexBusy,
  );

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {showNotConfigured ? (
        <Alert role="note">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden />
          <AlertDescription className="text-xs">
            {t('settings.ai.embeddings.status.not_configured')}
          </AlertDescription>
        </Alert>
      ) : null}

      {embedLoading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner />
          {t('settings.embeddings.loading')}
        </p>
      ) : null}

      {embedError ? (
        <Alert variant="destructive" role="note">
          <HugeiconsIcon icon={AlertCircleIcon} aria-hidden />
          <AlertDescription className="text-xs">{embedError}</AlertDescription>
        </Alert>
      ) : null}

      {showStatus && embedStatus ? (
        <>
          <EmbeddingModelMeta status={embedStatus} />
          <EmbeddingLibraryBody status={embedStatus} />
          {showReindexProgress && embedProgress ? (
            <p className="text-xs text-muted-foreground">
              {t('settings.embeddings.progress', {
                done: embedProgress.done,
                total: embedProgress.total,
              })}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function IndexingSection() {
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

  // Pause the 8s status poll while a bulk operation runs.
  useEffect(() => {
    setPausePolling(libraryBusy);
  }, [libraryBusy]);

  const handleRefresh = () => {
    setEmbedLoading(true); loadEmbedStatus();
  };

  const fullSyncPercent = computeFullSyncPercent(fullSyncProgress);

  return (
    <SettingsSurface
      icon={DatabaseIcon}
      title={t('settings.indexing.title')}
      description={t('settings.indexing.subtitle')}
    >
      <SettingsGroup title={t('settings.indexing.full_sync_section')}>
        <SettingsRow
          title={t('settings.indexing.full_sync_title')}
          description={t('settings.indexing.full_sync_hint')}
          control={
            <FullSyncButton
              busy={fullSyncBusy}
              libraryBusy={libraryBusy}
              onFullSync={() => {
                handleFullSync().catch(() => {});
              }}
            />
          }
        >
          <FullSyncProgressBlock progress={fullSyncProgress} percent={fullSyncPercent} />
          <FullSyncDoneAlert result={fullSyncResult} busy={fullSyncBusy} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title={t('settings.embeddings.section_title')}
        description={t('settings.embeddings.section_hint')}
        actions={
          !embedLoading ? (
            <EmbeddingsGroupActions
              libraryBusy={libraryBusy}
              embedReindexBusy={embedReindexBusy}
              onRefresh={handleRefresh}
              onReindex={() => {
                handleSemanticReindexAll().catch(() => {});
              }}
            />
          ) : undefined
        }
      >
        <EmbeddingsStatusPanel
          embedStatus={embedStatus}
          embedLoading={embedLoading}
          embedError={embedError}
          embedProgress={embedProgress}
          embedReindexBusy={embedReindexBusy}
        />
      </SettingsGroup>

      {lastError ? (
        <Alert variant="destructive" role="note">
          <HugeiconsIcon icon={AlertCircleIcon} aria-hidden />
          <AlertDescription className="text-xs">{lastError}</AlertDescription>
        </Alert>
      ) : null}
    </SettingsSurface>
  );
}
