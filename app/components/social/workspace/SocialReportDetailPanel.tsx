import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { BarChartIcon, BubbleChatIcon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import type { SocialReport } from '@/components/social/socialTypes';
import { HubDetailPane } from '@/components/shared/HubDetailPane';
import { ActionIcon, ReadField, SectionCard } from '@/components/social/crm/socialCrmChrome';
import { useManyStore } from '@/lib/store/useManyStore';
import { useTabStore } from '@/lib/store/useTabStore';

export function SocialReportDetailPanel({
  report,
  kpi,
}: {
  report: SocialReport;
  kpi?: Array<{ label: string; value: string }>;
}) {
  const { t } = useTranslation();
  const unavailable = t('social.studio.crm.unavailable');
  const title = report.title || t('social.reports.untitled');

  const handleMany = () => {
    const many = useManyStore.getState();
    many.setPendingManyHandoff(t('social.agent_prompt_report', { title }));
    many.setOpen(true);
  };

  return (
    <HubDetailPane
      icon={
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <HugeiconsIcon icon={BarChartIcon} />
        </div>
      }
      title={title}
      badge={<Badge variant="outline">{t(`social.studio.status.${report.status}`)}</Badge>}
      subtitle={
        <p className="text-xs text-muted-foreground">{new Date(report.createdAt).toLocaleDateString()}</p>
      }
      toolbar={
        <div className="flex items-center gap-1.5">
          <ActionIcon
            label={t('social.agent_ask_many')}
            available
            unavailableLabel={unavailable}
            icon={BubbleChatIcon}
            onClick={handleMany}
          />
          <ActionIcon
            label={t('social.studio.insights.view_leads')}
            available
            unavailableLabel={unavailable}
            icon={BarChartIcon}
            onClick={() => useTabStore.getState().openPeopleTab()}
          />
        </div>
      }
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {kpi && kpi.length > 0 ? (
            <SectionCard title={t('social.studio.insights.eyebrow')}>
              <div className="grid gap-3 sm:grid-cols-2">
                {kpi.map((item) => (
                  <ReadField key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            </SectionCard>
          ) : null}
          <SectionCard title={t('social.studio.inspector.report')}>
            {report.status === 'failed' ? (
              <p className="text-xs text-destructive">{report.error || t('social.reports.untitled')}</p>
            ) : report.status === 'generating' || !report.content ? (
              <p className="text-xs text-muted-foreground">{t('social.reports.generating_hint')}</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
                <MarkdownRenderer content={report.content} />
              </div>
            )}
          </SectionCard>
        </div>
      </ScrollArea>
    </HubDetailPane>
  );
}
