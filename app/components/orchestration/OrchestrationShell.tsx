import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Activity01Icon, BotIcon, GitBranchIcon, ZapIcon } from '@hugeicons/core-free-icons';
import { useTabStore } from '@/lib/store/useTabStore';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type OrchestrationSection = 'agents' | 'workflows' | 'automations' | 'runs';

export interface OrchestrationStat {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'accent' | 'success' | 'error' | 'warning' | 'info';
}

interface Props {
  section: OrchestrationSection;
  title: string;
  subtitle: string;
  stats: OrchestrationStat[];
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}

const SECTION_ICONS: Record<OrchestrationSection, IconSvgElement> = {
  agents: BotIcon,
  workflows: GitBranchIcon,
  automations: ZapIcon,
  runs: Activity01Icon,
};

const STAT_TONE_CLASS: Record<NonNullable<OrchestrationStat['tone']>, string> = {
  default: 'text-foreground',
  accent: 'text-primary',
  success: 'text-success',
  error: 'text-destructive',
  warning: 'text-warning',
  info: 'text-info',
};

export default function OrchestrationShell({
  section,
  title,
  subtitle,
  stats,
  actions,
  toolbar,
  children,
}: Props) {
  const { t } = useTranslation();
  const { openAgentsTab, openWorkflowsTab, openAutomationsTab, openRunsTab } = useTabStore();
  const sectionIcon = SECTION_ICONS[section];

  const crossNav: Array<{ key: OrchestrationSection; label: string; open: () => void }> = [
    { key: 'agents', label: t('tabs.agents'), open: openAgentsTab },
    { key: 'workflows', label: t('tabs.workflows'), open: openWorkflowsTab },
    { key: 'automations', label: t('tabs.automations'), open: openAutomationsTab },
    { key: 'runs', label: t('tabs.runs'), open: openRunsTab },
  ];

  const navigate = (value: string) => {
    if (value === section) return;
    crossNav.find((item) => item.key === value)?.open();
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b px-6 py-4">
        <Tabs value={section} onValueChange={navigate} className="mb-5">
          <TabsList aria-label={t('orchestration.sections_nav')}>
            {crossNav.map(({ key, label }) => (
              <TabsTrigger key={key} value={key}>
                <HugeiconsIcon icon={SECTION_ICONS[key]} data-icon="inline-start" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <PageHeader
          title={title}
          description={subtitle}
          actions={actions}
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <HugeiconsIcon icon={sectionIcon} className="size-3.5" />
              {t('orchestration.sections_nav')}
            </span>
          }
        />

        {stats.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label} className="gap-1 py-3 shadow-none">
                <CardContent className="px-3.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </div>
                  <div className={cn('mt-0.5 text-2xl font-semibold leading-tight tabular-nums', STAT_TONE_CLASS[stat.tone ?? 'default'])}>
                    {stat.value}
                  </div>
                  {stat.sub ? <div className="truncate text-xs text-muted-foreground" title={stat.sub}>{stat.sub}</div> : null}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
      </header>

      {toolbar ? <div className="shrink-0 border-b bg-background px-6 py-2.5">{toolbar}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
