/** Right-hand run overview column (03/T02 — extracted from RunsWorkspaceView.tsx). */

import { useTranslation } from 'react-i18next';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { formatRunDate, formatDuration } from '@/lib/automations/run-log-format';
import { getRunUsageFromRunMetadata } from '@/lib/automations/run-cost';
import { getRunProgress } from '@/lib/automations/run-progress';
import { isAutomationLinkedRun, type PersistentRun } from '@/lib/automations/api';
import { formatIntToken } from './runPresentation';
import { RunOverviewStatRow } from './RunStepBits';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface RunRightOverviewProps {
  run: PersistentRun;
  ownerKindLabel: string;
  progress: ReturnType<typeof getRunProgress>;
  usage: ReturnType<typeof getRunUsageFromRunMetadata>;
  costLabel: string;
  providerLabel?: string;
  modelId?: string;
}

function targetLabel(run: PersistentRun, t: (key: string) => string): string | null {
  if (!isAutomationLinkedRun(run)) return null;
  switch (run.ownerType) {
    case 'agent':
      return t('runLog.detail_target_agent');
    case 'workflow':
      return t('runLog.detail_target_workflow');
    case 'many':
      return t('runLog.detail_target_many');
    case 'automation':
      return null;
    default: {
      const _exhaustive: never = run.ownerType;
      return _exhaustive;
    }
  }
}

export default function RunRightOverview({
  run,
  ownerKindLabel,
  progress,
  usage,
  costLabel,
  providerLabel,
  modelId,
}: RunRightOverviewProps) {
  const { t, i18n } = useTranslation();
  const panelClass =
    'min-w-0 rounded-md border border-border bg-card px-3 py-2.5';
  const runTarget = targetLabel(run, t);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
      <section className={panelClass}>
        <h3 className="text-[11px] font-medium mb-2 text-muted-foreground">
          {t('runLog.detail_run_overview')}
        </h3>
        <div className="min-w-0 divide-y divide-border">
          <RunOverviewStatRow label={t('runLog.detail_owner')} value={ownerKindLabel} />
          {runTarget ? (
            <RunOverviewStatRow label={t('runLog.detail_target')} value={runTarget} />
          ) : null}
          {providerLabel || modelId ? (
            <RunOverviewStatRow
              label={t('runLog.detail_provider_model')}
              value={[providerLabel, modelId].filter(Boolean).join(' · ') || t('runLog.em_dash')}
            />
          ) : null}
          {run.automationId ? (
            <RunOverviewStatRow label={t('runLog.detail_automation_id')} value={run.automationId} />
          ) : null}
          <RunOverviewStatRow
            label={t('runLog.detail_steps_label')}
            value={
              (run.steps?.length ?? 0) === 1
                ? t('runLog.step_singular')
                : t('runLog.step_plural', { count: run.steps?.length ?? 0 })
            }
          />
          {run.summary ? (
            <RunOverviewStatRow label={t('runLog.summary')} value={<span className="break-words">{run.summary}</span>} />
          ) : null}
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-[11px] font-medium mb-2 text-muted-foreground">
          {t('runLog.detail_section_time')}
        </h3>
        <div className="min-w-0 divide-y divide-border">
          <RunOverviewStatRow label={t('runLog.duration')} value={formatDuration(run.startedAt, run.finishedAt)} />
          {run.lastHeartbeatAt ? (
            <RunOverviewStatRow label={t('runLog.detail_heartbeat')} value={formatRunDate(run.lastHeartbeatAt)} />
          ) : null}
          {progress?.mode === 'determinate' ? (
            <RunOverviewStatRow
              label={t('runLog.detail_workflow_progress')}
              value={`${progress.percent ?? 0}% · ${progress.completed ?? 0}/${progress.total ?? 0}`}
            />
          ) : null}
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-[11px] font-medium mb-2 text-muted-foreground">
          {t('runLog.detail_section_usage')}
        </h3>
        {usage ? (
          <dl className="grid grid-cols-3 gap-2 text-[11px] min-w-0">
            {[
              { k: 'in' as const, label: t('runLog.detail_tokens_in'), v: usage.inputTokens },
              { k: 'out' as const, label: t('runLog.detail_tokens_out'), v: usage.outputTokens },
              { k: 'tot' as const, label: t('runLog.detail_tokens_total'), v: usage.totalTokens },
            ].map(({ k, label, v }) => (
              <div key={k} className="min-w-0">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 tabular-nums font-medium break-all text-foreground">
                  {formatIntToken(v, i18n.language)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t('runLog.detail_no_usage')}
          </p>
        )}
        <div className="mt-3 pt-2 border-t border-border">
          <p className="text-xs tabular-nums text-foreground">
            {t('runLog.detail_estimated_cost')}: {costLabel}
          </p>
          <p className="text-[10px] mt-1.5 leading-relaxed text-muted-foreground">
            {t('runLog.detail_cost_disclaimer')}
          </p>
        </div>
      </section>

      {run.error ? (
        <Alert variant="destructive">
          <AlertTitle>{t('runLog.error_title')}</AlertTitle>
          <AlertDescription className="font-mono text-[11px] whitespace-pre-wrap break-words">
            {run.error}
          </AlertDescription>
        </Alert>
      ) : null}

      {run.outputText ? (
        <section className={panelClass}>
          <h3 className="text-[11px] font-medium mb-2 text-muted-foreground">
            {t('runLog.response')}
          </h3>
          <div className="text-sm min-w-0 overflow-x-auto border-t border-border pt-2 -mx-1 px-1">
            <div className="min-w-0 break-words">
              <MarkdownRenderer content={run.outputText} />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ─── Run Detail Screen ────────────────────────────────────────────────────────
