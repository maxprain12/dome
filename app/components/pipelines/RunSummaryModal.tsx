import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, CalendarClock, Loader2, Wrench, Activity as ActivityIcon } from 'lucide-react';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import type { PipelineItemEvent } from '@/lib/pipelines/types';

interface RunStep {
  id: string;
  stepType: string;
  title: string | null;
  status: string;
  content: string | null;
  createdAt: number;
}
interface RunData {
  outputText?: string;
  status?: string;
  steps?: RunStep[];
}

interface TimelineEntry {
  id: string;
  at: number;
  kind: 'step' | 'event';
  label: string;
  body: string | null;
}

interface Props {
  runId?: string;
  resourceId?: string;
  reportTitle?: string;
  cardTitle: string;
  events: PipelineItemEvent[];
  hasCalendar?: boolean;
  onOpenReport?: (resourceId: string, title: string) => void;
  onOpenCalendar?: () => void;
  onClose: () => void;
}

/**
 * Read-only summary of a Many-generated card report: the report itself
 * (markdown) plus a combined timeline of the run's steps and the card's
 * activity, with backlinks to the persisted report and the calendar event.
 */
export default function RunSummaryModal({
  runId,
  resourceId,
  reportTitle,
  cardTitle,
  events,
  hasCalendar,
  onOpenReport,
  onOpenCalendar,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [run, setRun] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(false);

  const [prevRunId, setPrevRunId] = useState(runId);
  if (runId !== prevRunId) {
    setPrevRunId(runId);
    setLoading(Boolean(runId));
  }

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    window.electron
      .invoke('runs:get', runId)
      .then((res: { success: boolean; data?: RunData }) => {
        if (!cancelled) setRun(res?.success ? res.data ?? null : null);
      })
      .catch(() => {
        if (!cancelled) setRun(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const reportMd = run?.outputText ?? '';

  // "Ambos combinados": merge the run's tool steps with the card activity into
  // one chronological timeline.
  const timeline = useMemo<TimelineEntry[]>(() => {
    const stepEntries: TimelineEntry[] = (run?.steps ?? []).map((s) => ({
      id: `step-${s.id}`,
      at: s.createdAt,
      kind: 'step',
      label: s.title || s.stepType || 'step',
      body: s.content && s.content.trim() ? s.content.trim().slice(0, 400) : null,
    }));
    const eventEntries: TimelineEntry[] = events.map((e) => ({
      id: `ev-${e.id}`,
      at: e.createdAt,
      kind: 'event',
      label: e.summary ?? e.eventType,
      body: null,
    }));
    return [...stepEntries, ...eventEntries].sort((a, b) => a.at - b.at);
  }, [run?.steps, events]);

  return (
    <DomeModal
      open
      onClose={onClose}
      title={cardTitle}
      subtitle={t('pipelines.run_summary')}
      size="lg"
      footer={
        <>
          {hasCalendar && onOpenCalendar && (
            <DomeButton variant="ghost" size="sm" onClick={onOpenCalendar} leftIcon={<CalendarClock className="size-4" />}>
              {t('pipelines.open_calendar_event')}
            </DomeButton>
          )}
          <div style={{ flex: 1 }} />
          {resourceId && onOpenReport && (
            <DomeButton
              variant="outline"
              size="sm"
              onClick={() => onOpenReport(resourceId, reportTitle ?? cardTitle)}
              leftIcon={<ExternalLink className="size-4" />}
            >
              {t('pipelines.open_in_editor')}
            </DomeButton>
          )}
          <DomeButton variant="primary" size="sm" onClick={onClose}>
            {t('pipelines.cancel')}
          </DomeButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Report */}
        <section className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--tertiary-text)' }}>
            {t('pipelines.report_section')}
          </span>
          {loading && !reportMd ? (
            <div className="flex items-center gap-2 py-3 text-sm" style={{ color: 'var(--tertiary-text)' }}>
              <Loader2 className="animate-spin" size={16} />
              {t('pipelines.report_generating')}
            </div>
          ) : reportMd ? (
            <div
              className="rounded-md px-3 py-2 max-h-72 overflow-y-auto text-sm"
              style={{ background: 'var(--bg)', color: 'var(--secondary-text)', border: '1px solid var(--border)' }}
            >
              <MarkdownRenderer content={reportMd} />
            </div>
          ) : (
            <span className="text-sm py-2" style={{ color: 'var(--tertiary-text)' }}>
              {t('pipelines.no_history')}
            </span>
          )}
        </section>

        {/* Combined timeline: run steps + card activity */}
        <section className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--tertiary-text)' }}>
            {t('pipelines.steps_section')}
          </span>
          <div className="flex flex-col gap-1.5">
            {timeline.length === 0 && (
              <span className="text-sm py-1" style={{ color: 'var(--tertiary-text)' }}>
                {t('pipelines.activity_empty')}
              </span>
            )}
            {timeline.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 rounded-md px-2 py-1.5"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
              >
                {entry.kind === 'step' ? (
                  <Wrench size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                ) : (
                  <ActivityIcon size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--tertiary-text)' }} />
                )}
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="text-sm truncate" style={{ color: 'var(--primary-text)' }}>
                    {entry.label}
                  </span>
                  {entry.body && (
                    <span className="text-[11px] whitespace-pre-wrap" style={{ color: 'var(--tertiary-text)' }}>
                      {entry.body}
                    </span>
                  )}
                </div>
                <span className="text-[11px] shrink-0" style={{ color: 'var(--tertiary-text)' }}>
                  {new Date(entry.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DomeModal>
  );
}
