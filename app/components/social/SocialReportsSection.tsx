import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles, Loader2, Trash2, ChevronDown, ChevronRight, AlertTriangle,
} from 'lucide-react';
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
    <div className="space-y-4 max-w-5xl">
      {/* Config + generate */}
      <div
        className="rounded-lg px-4 py-3.5"
        style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)' }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--dome-text-muted)' }}>
              {t('social.reports.auto_interval')}
            </label>
            <select
              value={config?.intervalHours ?? 0}
              onChange={(e) => void updateConfig({ intervalHours: Number(e.target.value) })}
              className="rounded-md px-2.5 py-1.5 text-xs"
              style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
            >
              {INTERVAL_OPTIONS.map((h) => (
                <option key={h} value={h}>{intervalLabel(h)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--dome-text-muted)' }}>
              {t('social.reports.period')}
            </label>
            <select
              value={config?.periodDays ?? 30}
              onChange={(e) => void updateConfig({ periodDays: Number(e.target.value) })}
              className="rounded-md px-2.5 py-1.5 text-xs"
              style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
            >
              {PERIOD_OPTIONS.map((d) => (
                <option key={d} value={d}>{t('social.reports.period_days', { count: d })}</option>
              ))}
            </select>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void generateNow()}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium whitespace-nowrap"
            style={{ background: 'var(--dome-accent)', color: 'white', opacity: generating ? 0.7 : 1 }}
          >
            {generating
              ? <Loader2 className="size-3.5 animate-spin" />
              : <Sparkles className="size-3.5" />}
            {generating ? t('social.reports.generating') : t('social.reports.generate_now')}
          </button>
        </div>
        <p className="text-xs mt-2.5" style={{ color: 'var(--dome-text-muted)' }}>
          {config && config.intervalHours > 0
            ? t('social.reports.auto_hint_on')
            : t('social.reports.auto_hint_off')}
        </p>
      </div>

      {error && (
        <p className="text-xs" style={{ color: 'var(--dome-error)' }}>{error}</p>
      )}

      {/* Report list */}
      {reports.length === 0 ? (
        <div
          className="rounded-lg px-4 py-8 text-center"
          style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)' }}
        >
          <div
            className="flex items-center justify-center size-10 rounded-full mx-auto mb-3"
            style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
          >
            <Sparkles className="size-5" style={{ color: 'var(--dome-accent)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
            {t('social.reports.empty_title')}
          </p>
          <p className="text-xs mt-1 max-w-md mx-auto" style={{ color: 'var(--dome-text-muted)' }}>
            {t('social.reports.empty_hint')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
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
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)' }}
    >
      <div className="flex items-center gap-2 pr-2 hover:bg-[var(--dome-bg-hover)]">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-3 flex-1 min-w-0 text-left px-3 py-2.5"
        >
          <span
            className="flex items-center justify-center size-8 rounded-lg shrink-0"
            style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
          >
            {report.status === 'generating' ? (
              <Loader2 className="size-4 animate-spin" style={{ color: 'var(--dome-accent)' }} />
            ) : report.status === 'failed' ? (
              <AlertTriangle className="size-4" style={{ color: 'var(--dome-error)' }} />
            ) : (
              <Sparkles className="size-4" style={{ color: 'var(--dome-accent)' }} />
            )}
          </span>
          <span className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium truncate" style={{ color: 'var(--dome-text)' }}>
              {report.title
                || (report.status === 'generating'
                  ? t('social.reports.generating')
                  : t('social.reports.untitled'))}
            </span>
            <span
              className="flex items-center gap-1.5 text-xs mt-0.5 flex-wrap"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              <span>{new Date(report.createdAt).toLocaleString()}</span>
              <span>·</span>
              <span>{t('social.reports.period_days', { count: report.periodDays })}</span>
              {report.trigger === 'auto' && (
                <span
                  className="rounded-full px-1.5 py-px"
                  style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
                >
                  {t('social.reports.trigger_auto')}
                </span>
              )}
            </span>
          </span>
          <Chevron className="size-4 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-md hover:bg-[var(--dome-bg)] shrink-0"
          title={t('social.hub.delete')}
        >
          <Trash2 className="size-3.5" style={{ color: 'var(--dome-error)' }} />
        </button>
      </div>
      {open && (
        <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--dome-border)' }}>
          {report.status === 'failed' ? (
            <p className="text-xs mt-3" style={{ color: 'var(--dome-error)' }}>{report.error}</p>
          ) : report.status === 'generating' ? (
            <p className="text-xs mt-3" style={{ color: 'var(--dome-text-muted)' }}>
              {t('social.reports.generating_hint')}
            </p>
          ) : (
            <div className="text-sm mt-3" style={{ color: 'var(--dome-text)' }}>
              <MarkdownRenderer content={report.content || ''} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
