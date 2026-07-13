import { HugeiconsIcon } from '@hugeicons/react';
import {
  PlayIcon,
  SecurityCheckIcon,
  ShieldEnergyIcon,
  HistoryIcon,
  Key01Icon,
  Delete02Icon,
  RefreshIcon,
  Clock01Icon,
  DatabaseIcon,
  AlertCircleIcon,
} from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { notifications } from '@/lib/notifications';
import type { FeederRecord, FeederRunRecord } from '@/lib/feeders/api';
import {
  approveFeeder,
  deleteFeeder,
  getFeederHistory,
  listFeeders,
  runFeeder,
} from '@/lib/feeders/api';
import FeederApprovalModal from './FeederApprovalModal';
import SecretsManager from './SecretsManager';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import ListState from '@/components/shared/ListState';
import { cn } from '@/lib/utils';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
type Props = {
  artifactResourceId: string;
};

const STATUS_TO_COLOR: Record<string, string> = {
  completed: 'var(--success)',
  failed: 'var(--destructive)',
  running: 'var(--primary)',
  pending: 'var(--muted-foreground)',
};

function formatDuration(ms: number | null): string | null {
  if (ms == null) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatBytes(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FeedersPanel({ artifactResourceId }: Props) {
  const { t } = useTranslation();
  const [feeders, setFeeders] = useState<FeederRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<FeederRecord | null>(null);
  const [approving, setApproving] = useState(false);
  const [historyFeederId, setHistoryFeederId] = useState<string | null>(null);
  const [history, setHistory] = useState<FeederRunRecord[]>([]);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [pendingSecretName, setPendingSecretName] = useState<string | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<FeederRecord | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFeeders(artifactResourceId);
      if (res.success && res.data) setFeeders(res.data);
    } finally {
      setLoading(false);
    }
  }, [artifactResourceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onSecretRequest = (_e: unknown, payload: { name?: string }) => {
      if (payload?.name) {
        setPendingSecretName(payload.name);
        setSecretsOpen(true);
      }
    };
    const onFeederEvent = () => {
      void reload();
    };
    const removeSecret = window.electron.on('feeder:secret-request', onSecretRequest);
    const removeCreated = window.electron.on('feeder:created', onFeederEvent);
    const removeUpdated = window.electron.on('feeder:updated', onFeederEvent);
    const removeRun = window.electron.on('feeder:run-completed', onFeederEvent);
    return () => {
      removeSecret?.();
      removeCreated?.();
      removeUpdated?.();
      removeRun?.();
    };
  }, [reload]);

  const handleRun = async (feederId: string) => {
    setRunningId(feederId);
    try {
      const res = await runFeeder(feederId, 'user');
      if (res.success) {
        notifications.show({ message: t('feeders.run_ok'), color: 'green' });
        await reload();
        if (historyFeederId === feederId) {
          await loadHistory(feederId);
        }
      } else {
        notifications.show({ message: res.error ?? t('feeders.run_error'), color: 'red' });
      }
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : t('feeders.run_error'),
        color: 'red',
      });
    } finally {
      setRunningId(null);
    }
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    setApproving(true);
    try {
      const res = await approveFeeder(approveTarget.id);
      if (res.success) {
        notifications.show({ message: t('feeders.approve_ok'), color: 'green' });
        setApproveTarget(null);
        await reload();
      } else {
        notifications.show({ message: res.error ?? t('feeders.approve_error'), color: 'red' });
      }
    } finally {
      setApproving(false);
    }
  };

  const handleDelete = async (feederId: string) => {
    try {
      const res = await deleteFeeder(feederId);
      if (res.success) {
        notifications.show({ message: t('feeders.delete_ok'), color: 'green' });
        if (historyFeederId === feederId) {
          setHistoryFeederId(null);
          setHistory([]);
        }
        await reload();
      } else {
        notifications.show({ message: res.error ?? t('common.error'), color: 'red' });
      }
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : t('common.error'),
        color: 'red',
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const loadHistory = async (feederId: string) => {
    if (historyFeederId === feederId) {
      setHistoryFeederId(null);
      setHistory([]);
      return;
    }
    setHistoryFeederId(feederId);
    try {
      const res = await getFeederHistory(feederId, 10);
      if (res.success && res.data) {
        setHistory(res.data);
      } else {
        setHistory([]);
      }
    } catch {
      setHistory([]);
    }
  };

  return (
    <div
      className="flex flex-col h-full min-h-0 overflow-hidden bg-background"
    >
      {/* Header */}
      <header
        className="flex items-center justify-between gap-2 px-4 py-2.5 border-b shrink-0 border-border"
      >
        <div className="flex items-center gap-2 min-w-0">
          <HugeiconsIcon icon={DatabaseIcon} className="size-4 text-primary shrink-0" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground truncate">
            {t('feeders.panel_title')}
          </h2>
          {feeders.length > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {feeders.length}
            </span>
          ) : null}
        </div>
        <Button variant="ghost" onClick={() => setSecretsOpen(true)} size="xs">{<HugeiconsIcon icon={Key01Icon} className="size-3.5" />}
          {t('feeders.secrets_button')}
        </Button>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-y-2.5">
        {loading ? (
          <ListState variant="loading" />
        ) : feeders.length === 0 ? (
          <ListState
            variant="empty"
            icon={<HugeiconsIcon icon={DatabaseIcon} className="size-6 text-muted-foreground" />}
            title={t('feeders.empty')}
            description={t('feeders.empty_hint')}
          />
        ) : (
          feeders.map((feeder) => {
            const isRunning = runningId === feeder.id;
            const isHistoryOpen = historyFeederId === feeder.id;
            const secretRefs = (feeder.envSecretRefs ?? []).filter(
              (r) => r?.envName && r?.secretName,
            );
            return (
              <Card className="p-3 flex flex-col gap-2.5" key={feeder.id}>
                {/* Title row */}
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {feeder.approved ? (
                      <HugeiconsIcon icon={SecurityCheckIcon}
                        className="size-4 shrink-0 text-[var(--success)]"
                        aria-hidden
                      />
                    ) : (
                      <HugeiconsIcon icon={ShieldEnergyIcon}
                        className="size-4 shrink-0 text-[var(--warning)]"
                        aria-hidden
                      />
                    )}
                    <span className="text-sm font-semibold text-foreground truncate">
                      {feeder.name}
                    </span>
                    <Badge variant="secondary" className="max-w-full font-semibold text-[10px] px-1.5 py-0.5 gap-1 h-auto" style={{ background: 'color-mix(in srgb, var(--primary) 18%, transparent)', color: 'var(--primary)', borderColor: 'transparent' }}><span className="truncate">{feeder.interpreter}</span></Badge>
                  </div>
                  {feeder.lastStatus ? (
                    <Badge variant="secondary" className="max-w-full font-semibold text-[10px] px-1.5 py-0.5 gap-1 h-auto" style={{ background: `color-mix(in srgb, ${STATUS_TO_COLOR[feeder.lastStatus] ?? 'var(--muted-foreground)'} 18%, transparent)`, color: STATUS_TO_COLOR[feeder.lastStatus] ?? 'var(--muted-foreground)', borderColor: 'transparent' }}><span className="truncate">{feeder.lastStatus}</span></Badge>
                  ) : null}
                </div>

                {feeder.description ? (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {feeder.description}
                  </p>
                ) : null}

                {/* Env secret refs — visible so users notice missing mappings */}
                {secretRefs.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                      env
                    </span>
                    {secretRefs.map((r) => (
                      <code
                        key={`${r.envName}-${r.secretName}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border border-border bg-background"
                        title={`process.env.${r.envName} ← vault[${r.secretName}]`}
                      >
                        <HugeiconsIcon icon={Key01Icon}
                          className="size-2.5 text-primary"
                          aria-hidden
                        />
                        <span className="text-foreground">{r.envName}</span>
                        <span className="text-muted-foreground">←</span>
                        <span className="text-primary">{r.secretName}</span>
                      </code>
                    ))}
                  </div>
                ) : null}

                {feeder.lastError ? (
                  <Alert variant="destructive" role="note"><HugeiconsIcon icon={AlertCircleIcon} aria-hidden /><AlertDescription className="text-xs">
                    <pre className="text-[10px] font-mono whitespace-pre-wrap break-words">
                      {feeder.lastError}
                    </pre>
                  </AlertDescription></Alert>
                ) : null}

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {!feeder.approved ? (
                    <Button variant="outline" onClick={() => setApproveTarget(feeder)} size="xs">{<HugeiconsIcon icon={SecurityCheckIcon} className="size-3" />}
                      {t('feeders.approve_action')}
                    </Button>
                  ) : null}
                  <Button onClick={() => void handleRun(feeder.id)} disabled={!feeder.approved || isRunning} size="xs">{
                      isRunning ? (
                        <HugeiconsIcon icon={RefreshIcon} className="size-3 animate-spin" />
                      ) : (
                        <HugeiconsIcon icon={PlayIcon} className="size-3" />
                      )
                    }
                    {t('feeders.run_now')}
                  </Button>
                  <Button variant="ghost" onClick={() => void loadHistory(feeder.id)} size="xs">{<HugeiconsIcon icon={HistoryIcon} className="size-3" />}
                    {t('feeders.history')}
                  </Button>
                  <Button variant="ghost" onClick={() => setDeleteTarget(feeder)} className="text-muted-foreground hover:text-destructive ml-auto" size="xs">{<HugeiconsIcon icon={Delete02Icon} className="size-3" />}
                    {t('common.delete')}
                  </Button>
                </div>

                {/* History */}
                {isHistoryOpen ? (
                  <HistoryList history={history} />
                ) : null}
              </Card>
            );
          })
        )}
      </div>

      <FeederApprovalModal
        feeder={approveTarget}
        opened={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        onApprove={() => void handleApprove()}
        approving={approving}
      />

      <SecretsManager
        opened={secretsOpen}
        onClose={() => {
          setSecretsOpen(false);
          setPendingSecretName(undefined);
        }}
        initialName={pendingSecretName}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={t('feeders.delete_confirm_title')}
        message={t('feeders.delete_confirm_message', { name: deleteTarget?.name ?? '' })}
        confirmLabel={t('common.delete')}
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) void handleDelete(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function HistoryList({ history }: { history: FeederRunRecord[] }) {
  const hasRuns = history.length > 0;
  const items = useMemo(
    () =>
      history.map((run) => ({
        ...run,
        durationMs: run.finishedAt && run.startedAt ? run.finishedAt - run.startedAt : null,
      })),
    [history],
  );

  return (
    <div className="border-t border-border pt-2.5 mt-0.5 flex flex-col gap-y-2">
      {!hasRuns ? (
        <p className="text-xs text-muted-foreground italic">No runs yet.</p>
      ) : (
        items.map((run) => {
          const duration = formatDuration(run.durationMs);
          const dataBytes = formatBytes(run.dataBytes);
          return (
            <div
              key={run.id}
              className={cn(
                'rounded-lg border px-2.5 py-2 text-xs',
                'border-border bg-background',
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <HugeiconsIcon icon={Clock01Icon}
                  className="size-3 text-muted-foreground shrink-0"
                  aria-hidden
                />
                <span className="text-muted-foreground tabular-nums">
                  {new Date(run.startedAt).toLocaleString()}
                </span>
                <Badge variant="secondary" className="max-w-full font-semibold text-[10px] px-1.5 py-0.5 gap-1 h-auto" style={{ background: `color-mix(in srgb, ${STATUS_TO_COLOR[run.status] ?? 'var(--muted-foreground)'} 18%, transparent)`, color: STATUS_TO_COLOR[run.status] ?? 'var(--muted-foreground)', borderColor: 'transparent' }}><span className="truncate">{run.status}</span></Badge>
                <Badge variant="outline" className="max-w-full font-semibold text-[10px] px-1.5 py-0.5 gap-1 h-auto" style={{ borderColor: 'var(--primary)', color: 'var(--primary)', background: 'transparent' }}><span className="truncate">{run.triggeredBy}</span></Badge>
                {run.exitCode != null ? (
                  <Badge variant="outline" className="max-w-full font-semibold text-[10px] px-1.5 py-0.5 gap-1 h-auto" style={{ borderColor: run.exitCode === 0 ? 'var(--muted-foreground)' : 'var(--destructive)', color: run.exitCode === 0 ? 'var(--muted-foreground)' : 'var(--destructive)', background: 'transparent' }}><span className="truncate">{`exit ${run.exitCode}`}</span></Badge>
                ) : null}
                {duration ? (
                  <Badge variant="outline" className="max-w-full font-semibold text-[10px] px-1.5 py-0.5 gap-1 h-auto" style={{ borderColor: 'var(--primary)', color: 'var(--primary)', background: 'transparent' }}><span className="truncate">{duration}</span></Badge>
                ) : null}
                {dataBytes ? (
                  <Badge variant="outline" className="max-w-full font-semibold text-[10px] px-1.5 py-0.5 gap-1 h-auto" style={{ borderColor: 'var(--primary)', color: 'var(--primary)', background: 'transparent' }}><span className="truncate">{dataBytes}</span></Badge>
                ) : null}
              </div>

              {run.stdoutExcerpt ? (
                <LogPane label="stdout" content={run.stdoutExcerpt} tone="neutral" />
              ) : null}
              {run.stderrExcerpt ? (
                <LogPane label="stderr" content={run.stderrExcerpt} tone="error" />
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

function LogPane({
  label,
  content,
  tone,
}: {
  label: string;
  content: string;
  tone: 'neutral' | 'error';
}) {
  return (
    <div className="mt-1.5">
      <p
        className={cn(
          'text-[10px] uppercase tracking-wide font-semibold mb-1',
          tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {label}
      </p>
      <pre
        className={cn(
          'rounded-md border px-2 py-1.5 text-[10px] leading-relaxed font-mono whitespace-pre-wrap break-words overflow-auto',
          'border-border',
          tone === 'error'
            ? 'bg-[color-mix(in_srgb,var(--destructive)_6%,var(--background))] text-foreground'
            : 'bg-muted text-foreground',
        )}
        style={{ maxHeight: 200 }}
      >
        {content}
      </pre>
    </div>
  );
}
