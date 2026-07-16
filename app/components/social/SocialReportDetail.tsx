import { Button } from '@/components/ui/button';
import { InlineDetailCard } from '@/components/shared/InlineDetailCard';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { useTranslation } from 'react-i18next';
import type { SocialReport } from '@/components/social/socialTypes';

export function SocialReportDetail({
  report,
  onClose,
  onAskMany,
}: {
  report: SocialReport;
  onClose: () => void;
  onAskMany: () => void;
}) {
  const { t } = useTranslation();

  return (
    <InlineDetailCard
      onClose={onClose}
      containerName="social-report"
      title={report.title || t('social.reports.untitled')}
      description={
        <span className="text-xs text-muted-foreground">
          {new Date(report.createdAt).toLocaleString()}
          {' · '}
          {t('social.reports.period_days', { count: report.periodDays })}
        </span>
      }
      footer={
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onAskMany}>
            {t('social.agent_ask_many')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      }
    >
      {report.status === 'failed' ? (
        <p className="text-sm text-destructive">{report.error || t('social.reports.untitled')}</p>
      ) : report.status === 'generating' ? (
        <p className="text-sm text-muted-foreground">{t('social.reports.generating_hint')}</p>
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
          <MarkdownRenderer content={report.content || ''} />
        </div>
      )}
    </InlineDetailCard>
  );
}
