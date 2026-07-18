import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { HugeiconsIcon } from '@hugeicons/react';
import { SparklesIcon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import type { SocialReport } from '@/components/social/socialTypes';

/**
 * Compact insights entry — generate / open last report in the detail panel.
 * Keeps the hub free of full markdown dumps.
 */
export function SocialInsightsStrip({
  onOpenReport,
}: {
  onOpenReport: (report: SocialReport) => void;
}) {
  const { t, i18n } = useTranslation();
  const [latest, setLatest] = useState<SocialReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await window.electron.invoke('social:reports:list');
    if (res?.success) {
      const reports = (res.data.reports || []) as SocialReport[];
      setLatest(reports.find((r) => r.status === 'ready') || reports[0] || null);
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
    const res = await window.electron.invoke('social:reports:generate', { language: lang });
    setGenerating(false);
    if (!res?.success) {
      setError(res?.error || 'Error');
      return;
    }
    if (res.data?.status === 'failed') {
      setError(res.data.error || 'Error');
      return;
    }
    if (res.data) onOpenReport(res.data as SocialReport);
    await load();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-2.5 py-2">
      <HugeiconsIcon icon={SparklesIcon} className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">{t('social.agent_reports_section')}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {latest?.title
            ? latest.title
            : t('social.agent_reports_hint_short')}
        </p>
      </div>
      {latest?.status === 'ready' ? (
        <Button type="button" size="xs" variant="outline" onClick={() => onOpenReport(latest)}>
          {t('social.agent_reports_open')}
        </Button>
      ) : null}
      <Button
        type="button"
        size="xs"
        variant="secondary"
        disabled={generating}
        onClick={() => void generateNow()}
      >
        {generating ? <Spinner data-icon="inline-start" /> : null}
        {generating ? t('social.reports.generating') : t('social.agent_reports_generate')}
      </Button>
      {error ? <p className="basis-full text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
