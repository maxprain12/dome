import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorialPageHero } from '@/components/home/editorial/EditorialPageHero';
import type { HubTab } from '@/components/automations/AutomationsHubView';

export function HubTabHero({
  tab,
  agentCount,
  workflowCount,
  projectName,
}: {
  tab: HubTab;
  agentCount: number;
  workflowCount: number;
  projectName?: string;
}) {
  const { t } = useTranslation();

  const config = useMemo(() => {
    switch (tab) {
      case 'agents':
        return {
          title: t('automationHub.tab_agents'),
          subtitle: t('automationHub.agents_subtitle'),
          stat: {
            label: t('automationHub.stat_agents'),
            value: agentCount,
            sub: projectName ?? undefined,
          },
        };
      case 'workflows':
        return {
          title: t('automationHub.tab_workflows'),
          subtitle: t('automationHub.workflows_subtitle'),
          stat: {
            label: t('automationHub.stat_workflows'),
            value: workflowCount,
            sub: projectName ?? undefined,
          },
        };
      case 'automations':
        return {
          title: t('automationHub.tab_automations'),
          subtitle: t('automationHub.automations_subtitle'),
          stat: {
            label: t('automationHub.stat_project'),
            value: agentCount + workflowCount,
            sub: projectName ?? undefined,
          },
        };
      case 'runs':
        return {
          title: t('automationHub.tab_runs'),
          subtitle: t('automationHub.runs_subtitle'),
          stat: {
            label: t('automationHub.stat_project'),
            value: '—',
            sub: projectName ?? undefined,
          },
        };
      default:
        return { title: '', subtitle: '', stat: undefined };
    }
  }, [tab, t, agentCount, workflowCount, projectName]);

  return (
    <EditorialPageHero
      title={config.title}
      subtitle={config.subtitle}
      eyebrowExtra={projectName}
      stat={config.stat}
      className={`hub-tab-hero hub-tab-hero-${tab}`}
    />
  );
}
