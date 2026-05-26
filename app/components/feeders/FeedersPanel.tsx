import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play,
  ShieldCheck,
  ShieldAlert,
  History,
  KeyRound,
  Trash2,
  RefreshCw,
  Clock,
  Database,
  AlertCircle,
} from 'lucide-react';
import { notifications } from '@mantine/notifications';
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
import DomeButton from '@/components/ui/DomeButton';
import DomeBadge from '@/components/ui/DomeBadge';
import DomeCard from '@/components/ui/DomeCard';
import DomeListState from '@/components/ui/DomeListState';
import DomeCallout from '@/components/ui/DomeCallout';
import { cn } from '@/lib/utils';

type Props = {
  artifactResourceId: string;
};

const STATUS_TO_COLOR: Record<string, string> = {
  completed: 'var(--success)',
  failed: 'var(--error)',
  running: 'var(--accent)',
  pending: 'var(--secondary-text)',
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
    const res = await deleteFeeder(feederId);
    if (res.success) {
      notifications.show({ message: t('feeders.delete_ok'), color: 'green' });
      if (historyFeederId === feederId) {
        setHistoryFeederId(null);
        setHistory([]);
      }
      await reload();
    }
  };

  const loadHistory = async (feederId: string) => {
    if (historyFeederId === feederId) {
      setHistoryFeederId(null);
      setHistory([]);
      return;
    }
    setHistoryFeederId(feederId);
    const res = await getFeederHistory(feederId, 10);
    if (res.success && res.data) setHistory(res.data);
  };

  return (
    <div
      className="flex flex-col h-full min-h-0 overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between gap-2 px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Database className="size-4 text-[var(--accent)] shrink-0" aria-hidden />
          <h2 className="text-sm font-semibold text-[var(--primary-text)] truncate">
            {t('feeders.panel_title')}
          </h2>
          {feeders.length > 0 ? (
            <span className="text-xs text-[var(--secondary-text)] tabular-nums">
              {feeders.length}
            </span>
          ) : null}
        </div>
        <DomeButton
          variant="ghost"
          size="xs"
          leftIcon={<KeyRound className="size-3.5" />}
          onClick={() => setSecretsOpen(true)}
        >
          {t('feeders.secrets_button')}
        </DomeButton>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
        {loading ? (
          <DomeListState variant="loading" />
        ) : feeders.length === 0 ? (
          <DomeListState
            variant="empty"
            icon={<Database className="size-6 text-[var(--secondary-text)]" />}
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
              <DomeCard key={feeder.id} padding="sm" className="flex flex-col gap-2.5">
                {/* Title row */}
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {feeder.approved ? (
                      <ShieldCheck
                        className="size-4 shrink-0 text-[var(--success)]"
                        aria-hidden
                      />
                    ) : (
                      <ShieldAlert
                        className="size-4 shrink-0 text-[var(--warning)]"
                        aria-hidden
                      />
                    )}
                    <span className="text-sm font-semibold text-[var(--primary-text)] truncate">
                      {feeder.name}
                    </span>
                    <DomeBadge label={feeder.interpreter} variant="soft" size="xs" />
                  </div>
                  {feeder.lastStatus ? (
                    <DomeBadge
                      label={feeder.lastStatus}
                      variant="soft"
                      size="xs"
                      color={STATUS_TO_COLOR[feeder.lastStatus] ?? 'var(--secondary-text)'}
                    />
                  ) : null}
                </div>

                {feeder.description ? (
                  <p className="text-xs text-[var(--secondary-text)] leading-relaxed">
                    {feeder.description}
                  </p>
                ) : null}

                {/* Env secret refs — visible so users notice missing mappings */}
                {secretRefs.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-[var(--secondary-text)] font-semibold">
                      env
                    </span>
                    {secretRefs.map((r) => (
                      <code
                        key={`${r.envName}-${r.secretName}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border border-[var(--border-soft)] bg-[var(--bg)]"
                        title={`process.env.${r.envName} ← vault[${r.secretName}]`}
                      >
                        <KeyRound
                          className="size-2.5 text-[var(--accent)]"
                          aria-hidden
                        />
                        <span className="text-[var(--primary-text)]">{r.envName}</span>
                        <span className="text-[var(--secondary-text)]">←</span>
                        <span className="text-[var(--accent)]">{r.secretName}</span>
                      </code>
                    ))}
                  </div>
                ) : null}

                {feeder.lastError ? (
                  <DomeCallout tone="error" icon={AlertCircle}>
                    <pre className="text-[10px] font-mono whitespace-pre-wrap break-words">
                      {feeder.lastError}
                    </pre>
                  </DomeCallout>
                ) : null}

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {!feeder.approved ? (
                    <DomeButton
                      variant="outline"
                      size="xs"
                      leftIcon={<ShieldCheck className="size-3" />}
                      onClick={() => setApproveTarget(feeder)}
                    >
                      {t('feeders.approve_action')}
                    </DomeButton>
                  ) : null}
                  <DomeButton
                    variant="primary"
                    size="xs"
                    leftIcon={
                      isRunning ? (
                        <RefreshCw className="size-3 animate-spin" />
                      ) : (
                        <Play className="size-3" />
                      )
                    }
                    onClick={() => void handleRun(feeder.id)}
                    disabled={!feeder.approved || isRunning}
                  >
                    {t('feeders.run_now')}
                  </DomeButton>
                  <DomeButton
                    variant="ghost"
                    size="xs"
                    leftIcon={<History className="size-3" />}
                    onClick={() => void loadHistory(feeder.id)}
                  >
                    {t('feeders.history')}
                  </DomeButton>
                  <DomeButton
                    variant="ghost"
                    size="xs"
                    leftIcon={<Trash2 className="size-3" />}
                    onClick={() => void handleDelete(feeder.id)}
                    className="text-[var(--secondary-text)] hover:text-[var(--error)] ml-auto"
                  >
                    {t('common.delete')}
                  </DomeButton>
                </div>

                {/* History */}
                {isHistoryOpen ? (
                  <HistoryList history={history} />
                ) : null}
              </DomeCard>
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
    <div className="border-t border-[var(--border-soft)] pt-2.5 mt-0.5 space-y-2">
      {!hasRuns ? (
        <p className="text-xs text-[var(--secondary-text)] italic">No runs yet.</p>
      ) : (
        items.map((run) => {
          const duration = formatDuration(run.durationMs);
          const dataBytes = formatBytes(run.dataBytes);
          return (
            <div
              key={run.id}
              className={cn(
                'rounded-lg border px-2.5 py-2 text-xs',
                'border-[var(--border)] bg-[var(--bg)]',
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Clock
                  className="size-3 text-[var(--secondary-text)] shrink-0"
                  aria-hidden
                />
                <span className="text-[var(--secondary-text)] tabular-nums">
                  {new Date(run.startedAt).toLocaleString()}
                </span>
                <DomeBadge
                  label={run.status}
                  variant="soft"
                  size="xs"
                  color={STATUS_TO_COLOR[run.status] ?? 'var(--secondary-text)'}
                />
                <DomeBadge label={run.triggeredBy} variant="outline" size="xs" />
                {run.exitCode != null ? (
                  <DomeBadge
                    label={`exit ${run.exitCode}`}
                    variant="outline"
                    size="xs"
                    color={run.exitCode === 0 ? 'var(--secondary-text)' : 'var(--error)'}
                  />
                ) : null}
                {duration ? (
                  <DomeBadge label={duration} variant="outline" size="xs" />
                ) : null}
                {dataBytes ? (
                  <DomeBadge label={dataBytes} variant="outline" size="xs" />
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
          tone === 'error' ? 'text-[var(--error)]' : 'text-[var(--secondary-text)]',
        )}
      >
        {label}
      </p>
      <pre
        className={cn(
          'rounded-md border px-2 py-1.5 text-[10px] leading-relaxed font-mono whitespace-pre-wrap break-words overflow-auto',
          'border-[var(--border-soft)]',
          tone === 'error'
            ? 'bg-[color-mix(in_srgb,var(--error)_6%,var(--bg))] text-[var(--primary-text)]'
            : 'bg-[var(--bg-tertiary)] text-[var(--primary-text)]',
        )}
        style={{ maxHeight: 200 }}
      >
        {content}
      </pre>
    </div>
  );
}
