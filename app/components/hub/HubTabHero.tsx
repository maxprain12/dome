import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorialPageHero } from '@/components/home/editorial/EditorialPageHero';
import type { HubTab } from '@/components/automations/AutomationsHubView';

export function HubTabHero({
  tab,
  projectName,
}: {
  tab: HubTab;
  projectName?: string;
}) {
  const { t } = useTranslation();

  const config = useMemo(() => {
    switch (tab) {
      case 'agents':
        return {
          title: t('automationHub.tab_agents'),
          subtitle: t('automationHub.agents_subtitle'),
        };
      case 'workflows':
        return {
          title: t('automationHub.tab_workflows'),
          subtitle: t('automationHub.workflows_subtitle'),
        };
      case 'automations':
        return {
          title: t('automationHub.tab_automations'),
          subtitle: t('automationHub.automations_subtitle'),
        };
      case 'runs':
        return {
          title: t('automationHub.tab_runs'),
          subtitle: t('automationHub.runs_subtitle'),
        };
      default:
        return { title: '', subtitle: '' };
    }
  }, [tab, t]);

  return (
    <EditorialPageHero
      title={config.title}
      subtitle={config.subtitle}
      eyebrowExtra={projectName}
      className={`hub-tab-hero hub-tab-hero-${tab}`}
    />
  );
}
