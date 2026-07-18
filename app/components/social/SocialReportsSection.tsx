import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, ChevronDownIcon, ChevronRightIcon, Delete02Icon, SparklesIcon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue , SelectGroup } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import type { SocialReport, SocialReportConfig } from '@/components/social/socialTypes';

const INTERVAL_OPTIONS = [0, 24, 72, 168, 336, 720] as const;
const PERIOD_OPTIONS = [7, 14, 30, 60, 90] as const;

export default function SocialReportsSection() {
  const { t, i18n } = useTranslation();
  const [reports, setReports] = useState<SocialReport[]>([]);
  const [config, setConfig] = useState<SocialReportConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await window.electron.invoke('social:reports:list');
    if (res?.success) {
      setReports(res.data.reports);
      setConfig(res.data.config);
      setSelectedId((prev) => prev ?? res.data.reports.find((r: SocialReport) => r.status === 'ready')?.id ?? null);
    }
  }, []);

  useEffect(() => {
    void load();
    const unsub = window.electron?.on?.('social:report-updated', () => void load());
    return () => unsub?.();
  }, [load]);

  const generateNow = async () => {
    setGenerating(true);
    setError(null);
    const lang = (['es', 'en', 'fr', 'pt'] as const).find((l) => i18n.language?.startsWith(l)) ?? 'es';
    const res = await window.electron.invoke('social:reports:generate', {
      periodDays: config?.periodDays,
      language: lang,
    });
    setGenerating(false);
    if (!res?.success) setError(res?.error || 'Error');
    else if (res.data?.status === 'failed') setError(res.data.error || 'Error');
    else setSelectedId(res.data?.id ?? null);
    await load();
  };

  const updateConfig = async (patch: Partial<SocialReportConfig>) => {
    const res = await window.electron.invoke('social:reports:config:set', patch);
    if (res?.success) setConfig(res.data);
  };

  const deleteReport = async (reportId: string) => {
    await window.electron.invoke('social:reports:delete', { reportId });
    if (selectedId === reportId) setSelectedId(null);
    await load();
  };

  const intervalLabel = (h: number) =>
    h === 0 ? t('social.reports.interval_off') : t('social.reports.interval_days', { count: h / 24 });

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      {/* Config + generate */}
      <Card size="sm" className="gap-0 rounded-xl px-4 py-3.5 shadow-none">
        <CardContent className="p-0">
        <div className="flex flex-wrap items-end gap-3">
          <Field className="w-auto gap-1">
            <FieldLabel className="text-xs text-muted-foreground">
              {t('social.reports.auto_interval')}
            </FieldLabel>
            <Select
              value={String(config?.intervalHours ?? 0)}
              onValueChange={(v) => { if (v != null) void updateConfig({ intervalHours: Number(v) }); }}
              items={INTERVAL_OPTIONS.map((h) => ({ value: String(h), label: intervalLabel(h) }))}
            >
              <SelectTrigger size="sm" className="text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                {INTERVAL_OPTIONS.map((h) => (
                  <SelectItem key={h} value={String(h)}>{intervalLabel(h)}</SelectItem>
                ))}
              </SelectGroup></SelectContent>
            </Select>
          </Field>
          <Field className="w-auto gap-1">
            <FieldLabel className="text-xs text-muted-foreground">
              {t('social.reports.period')}
            </FieldLabel>
            <Select
              value={String(config?.periodDays ?? 30)}
              onValueChange={(v) => { if (v != null) void updateConfig({ periodDays: Number(v) }); }}
              items={PERIOD_OPTIONS.map((d) => ({ value: String(d), label: t('social.reports.period_days', { count: d }) }))}
            >
              <SelectTrigger size="sm" className="text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                {PERIOD_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>{t('social.reports.period_days', { count: d })}</SelectItem>
                ))}
              </SelectGroup></SelectContent>
            </Select>
          </Field>
          <div className="flex-1" />
          <Button
            type="button"
            size="sm"
            className="text-xs"
            onClick={() => void generateNow()}
            disabled={generating}
          >
            {generating ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />}
            {generating ? t('social.reports.generating') : t('social.reports.generate_now')}
          </Button>
        </div>
        <p className="text-xs mt-2.5 text-muted-foreground">
          {config && config.intervalHours > 0
            ? t('social.reports.auto_hint_on')
            : t('social.reports.auto_hint_off')}
        </p>
        </CardContent>
      </Card>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Report list */}
      {reports.length === 0 ? (
        <Card size="sm" className="gap-0 rounded-xl px-4 py-8 text-center shadow-none">
          <CardContent className="p-0">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full border bg-background">
            <HugeiconsIcon icon={SparklesIcon} className="size-5 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">
            {t('social.reports.empty_title')}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {t('social.reports.empty_hint')}
          </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              open={selectedId === report.id}
              onToggle={() => setSelectedId(selectedId === report.id ? null : report.id)}
              onDelete={() => void deleteReport(report.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportRow({
  report,
  open,
  onToggle,
  onDelete,
}: {
  report: SocialReport;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const chevronIcon = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 pr-2 hover:bg-accent">
        <Button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-3 flex-1 min-w-0 text-left px-3 py-2.5"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background">
            {report.status === 'generating' ? (
              <Spinner className="size-4 text-primary" />
            ) : report.status === 'failed' ? (
              <HugeiconsIcon icon={Alert02Icon} className="size-4 text-destructive" />
            ) : (
              <HugeiconsIcon icon={SparklesIcon} className="size-4 text-primary" />
            )}
          </span>
          <span className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium truncate text-foreground">
              {report.title
                || (report.status === 'generating'
                  ? t('social.reports.generating')
                  : t('social.reports.untitled'))}
            </span>
            <span
              className="flex items-center gap-1.5 text-xs mt-0.5 flex-wrap text-muted-foreground"
            >
              <span>{new Date(report.createdAt).toLocaleString()}</span>
              <span>·</span>
              <span>{t('social.reports.period_days', { count: report.periodDays })}</span>
              {report.trigger === 'auto' && (
                <Badge variant="outline" className="bg-background px-1.5 py-px font-normal">
                  {t('social.reports.trigger_auto')}
                </Badge>
              )}
            </span>
          </span>
          <HugeiconsIcon icon={chevronIcon} className="size-4 shrink-0 text-muted-foreground" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger render={<Button type="button" size="icon-xs" variant="ghost" className="shrink-0" />}>
            <HugeiconsIcon icon={Delete02Icon} className="text-destructive" />
            <span className="sr-only">{t('social.hub.delete')}</span>
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t('social.hub.delete')}</AlertDialogTitle>
              <AlertDialogDescription>{report.title || t('social.reports.untitled')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDelete}>
                {t('social.hub.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {open && (
        <div className="border-t px-4 pb-4">
          {report.status === 'failed' ? (
            <p className="text-xs mt-3 text-destructive">{report.error}</p>
          ) : report.status === 'generating' ? (
            <p className="text-xs mt-3 text-muted-foreground">
              {t('social.reports.generating_hint')}
            </p>
          ) : (
            <div className="text-sm mt-3 text-foreground">
              <MarkdownRenderer content={report.content || ''} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
