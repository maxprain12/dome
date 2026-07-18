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
      setEmbedProgress(null);
      void loadEmbedStatus();
    }
  };

  return { embedReindexBusy, handleSemanticReindexAll };
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
    setEmbedLoading(true);
    void loadEmbedStatus();
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
            <Button type="button" size="sm" disabled={libraryBusy} onClick={() => void handleFullSync()}>
              {fullSyncBusy ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <HugeiconsIcon icon={Layers01Icon} data-icon="inline-start" />
              )}
              {fullSyncBusy
                ? t('settings.indexing.full_sync_running')
                : t('settings.indexing.full_sync_btn')}
            </Button>
          }
        >
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
                <span className="shrink-0 font-medium text-primary">{fullSyncPercent}%</span>
              </div>
              <Progress value={fullSyncPercent} className="h-1.5" />
            </div>
          ) : null}
          {fullSyncResult && !fullSyncBusy ? (
            <Alert role="note">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden />
              <AlertDescription className="text-xs">
                {t('settings.indexing.full_sync_done')}
                {fullSyncResult.totalResources > 0 && fullSyncResult.embeddingFailed > 0
                  ? ` ${t('settings.indexing.full_sync_summary_errors', {
                      emb: fullSyncResult.embeddingFailed,
                    })}`
                  : null}
              </AlertDescription>
            </Alert>
          ) : null}
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title={t('settings.embeddings.section_title')}
        description={t('settings.embeddings.section_hint')}
        actions={
          !embedLoading ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={libraryBusy}
              >
                <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
                {t('settings.embeddings.refresh')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSemanticReindexAll()}
                disabled={libraryBusy}
              >
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
          ) : undefined
        }
      >
        <div className="flex flex-col gap-3 px-4 py-4">
          {embedStatus && embedStatus.configured === false && !embedLoading ? (
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

          {embedStatus && !embedLoading ? (
            <>
              {embedStatus.modelVersion ? (
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-medium">
                    {t('settings.ai.embeddings.status.model_active')}:
                  </span>{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                    {embedStatus.modelVersion}
                  </code>
                  {embedStatus.dimensions != null ? (
                    <span className="ml-2">
                      ({embedStatus.dimensions}{' '}
                      {t('settings.ai.embeddings.status.dimensions').toLowerCase()})
                    </span>
                  ) : null}
                </p>
              ) : null}

              {embedStatus.indexableTotal === 0 ? (
                <Alert role="note">
                  <HugeiconsIcon icon={SparklesIcon} aria-hidden />
                  <AlertDescription className="text-xs">
                    {t('settings.embeddings.empty_library')}
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                    {[
                      {
                        label: t('settings.embeddings.total'),
                        value: embedStatus.indexableTotal,
                        warning: false,
                      },
                      {
                        label: t('settings.embeddings.indexed'),
                        value: embedStatus.indexedResourceCount,
                        warning: false,
                      },
                      {
                        label: t('settings.embeddings.pending'),
                        value: embedStatus.pendingCount,
                        warning: embedStatus.pendingCount > 0,
                      },
                      {
                        label: t('settings.embeddings.chunks'),
                        value: embedStatus.chunksTotal,
                        warning: false,
                      },
                    ].map(({ label, value, warning }) => (
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

                  {embedStatus.allIndexed ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <HugeiconsIcon
                        icon={CheckmarkCircle02Icon}
                        className="shrink-0 text-primary"
                      />
                      {t('settings.embeddings.all_indexed')}
                    </p>
                  ) : (
                    <Alert role="note">
                      <HugeiconsIcon icon={SparklesIcon} aria-hidden />
                      <AlertDescription className="text-xs">
                        {t('settings.embeddings.pending_label', {
                          count: embedStatus.pendingCount,
                        })}
                      </AlertDescription>
                    </Alert>
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
            </>
          ) : null}
        </div>
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
