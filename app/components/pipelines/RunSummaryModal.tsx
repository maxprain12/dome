import { useEffect, useMemo, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Activity01Icon, CalendarClockIcon, ExternalLinkIcon, Loading03Icon, Wrench01Icon } from '@hugeicons/core-free-icons';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import type { PipelineItemEvent } from '@/lib/pipelines/types';
import { cn } from '@/lib/utils';
import { typesetDocsClass } from '@/lib/typeset';
import {
  DetailDrawer,
  DetailDrawerBody,
  DetailDrawerContent,
  DetailDrawerFooter,
  DetailDrawerHeader,
  DetailDrawerPanel,
  DetailDrawerSection,
} from '@/components/shared/DetailDrawer';

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

  const prevRunIdRef = useRef(runId);
  if (runId !== prevRunIdRef.current) {
    prevRunIdRef.current = runId;
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
    <DetailDrawer open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DetailDrawerContent size="lg">
        <DetailDrawerHeader title={cardTitle} description={t('pipelines.run_summary')} />
        <DetailDrawerBody>
          <div className="flex flex-col gap-5">
            <DetailDrawerSection label={t('pipelines.report_section')}>
              {loading && !reportMd ? (
                <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                  <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
                  {t('pipelines.report_generating')}
                </div>
              ) : reportMd ? (
                <DetailDrawerPanel
                  className={cn(typesetDocsClass, 'max-h-72 overflow-y-auto text-foreground')}
                >
                  <MarkdownRenderer content={reportMd} />
                </DetailDrawerPanel>
              ) : (
                <p className="py-2 text-sm text-muted-foreground">{t('pipelines.no_history')}</p>
              )}
            </DetailDrawerSection>

            <DetailDrawerSection label={t('pipelines.steps_section')}>
              <div className="flex flex-col gap-1.5">
                {timeline.length === 0 ? (
                  <p className="py-1 text-sm text-muted-foreground">{t('pipelines.activity_empty')}</p>
                ) : null}
                {timeline.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2 rounded-lg border border-border bg-background px-2.5 py-2"
                  >
                    {entry.kind === 'step' ? (
                      <HugeiconsIcon icon={Wrench01Icon} size={14} className="mt-0.5 shrink-0 text-primary" />
                    ) : (
                      <HugeiconsIcon icon={Activity01Icon} size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm text-foreground">{entry.label}</span>
                      {entry.body ? (
                        <span className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                          {entry.body}
                        </span>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {new Date(entry.at).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </DetailDrawerSection>
          </div>
        </DetailDrawerBody>
        <DetailDrawerFooter>
          {hasCalendar && onOpenCalendar ? (
            <Button variant="ghost" onClick={onOpenCalendar} size="sm">
              <HugeiconsIcon icon={CalendarClockIcon} className="size-4" />
              {t('pipelines.open_calendar_event')}
            </Button>
          ) : null}
          <div className="flex-1" />
          {resourceId && onOpenReport ? (
            <Button
              variant="outline"
              onClick={() => onOpenReport(resourceId, reportTitle ?? cardTitle)}
              size="sm"
            >
              <HugeiconsIcon icon={ExternalLinkIcon} className="size-4" />
              {t('pipelines.open_in_editor')}
            </Button>
          ) : null}
          <Button onClick={onClose} size="sm">
            {t('pipelines.close')}
          </Button>
        </DetailDrawerFooter>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
