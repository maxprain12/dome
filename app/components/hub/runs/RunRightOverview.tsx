/** Right-hand run overview column (03/T02 — extracted from RunsWorkspaceView.tsx). */

import { useTranslation } from 'react-i18next';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { formatRunDate, formatDuration } from '@/components/automations/RunLogView';
import { getRunUsageFromRunMetadata } from '@/lib/automations/run-cost';
import { getRunProgress } from '@/lib/automations/run-progress';
import type { PersistentRun } from '@/lib/automations/api';
import { formatIntToken } from './runPresentation';
import { RunOverviewStatRow } from './RunStepBits';

interface RunRightOverviewProps {
  run: PersistentRun;
  ownerKindLabel: string;
  progress: ReturnType<typeof getRunProgress>;
  usage: ReturnType<typeof getRunUsageFromRunMetadata>;
  costLabel: string;
  providerLabel?: string;
  modelId?: string;
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
    'min-w-0 rounded-md border border-[var(--dome-border)] bg-[var(--dome-surface)] px-3 py-2.5';
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
      <section className={panelClass}>
        <h3 className="text-[11px] font-medium mb-2" style={{ color: 'var(--dome-text-muted)' }}>
          {t('runLog.detail_run_overview')}
        </h3>
        <div className="min-w-0 divide-y divide-[var(--dome-border)]">
          <RunOverviewStatRow label={t('runLog.detail_owner')} value={ownerKindLabel} />
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
        <h3 className="text-[11px] font-medium mb-2" style={{ color: 'var(--dome-text-muted)' }}>
          {t('runLog.detail_section_time')}
        </h3>
        <div className="min-w-0 divide-y divide-[var(--dome-border)]">
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
        <h3 className="text-[11px] font-medium mb-2" style={{ color: 'var(--dome-text-muted)' }}>
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
                <dt style={{ color: 'var(--dome-text-muted)' }}>{label}</dt>
                <dd className="mt-0.5 tabular-nums font-medium break-all" style={{ color: 'var(--dome-text)' }}>
                  {formatIntToken(v, i18n.language)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            {t('runLog.detail_no_usage')}
          </p>
        )}
        <div className="mt-3 pt-2 border-t border-[var(--dome-border)]">
          <p className="text-xs tabular-nums" style={{ color: 'var(--dome-text)' }}>
            {t('runLog.detail_estimated_cost')}: {costLabel}
          </p>
          <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
            {t('runLog.detail_cost_disclaimer')}
          </p>
        </div>
      </section>

      {run.error ? (
        <div
          className="rounded-md border px-3 py-2 text-sm min-w-0 overflow-hidden"
          style={{
            borderColor: 'var(--error)',
            background: 'color-mix(in srgb, var(--error) 6%, transparent)',
            color: 'var(--error)',
          }}
        >
          <p className="font-medium mb-1 text-xs">{t('runLog.error_title')}</p>
          <p className="text-[11px] font-mono break-words whitespace-pre-wrap">{run.error}</p>
        </div>
      ) : null}

      {run.outputText ? (
        <section className={panelClass}>
          <h3 className="text-[11px] font-medium mb-2" style={{ color: 'var(--dome-text-muted)' }}>
            {t('runLog.response')}
          </h3>
          <div className="text-sm min-w-0 overflow-x-auto border-t border-[var(--dome-border)] pt-2 -mx-1 px-1">
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

