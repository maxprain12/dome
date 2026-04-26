import type { TFunction } from 'i18next';
import type { DomeTab } from '@/lib/store/useTabStore';

/** Localized label for a tab row (singleton types ignore persisted `tab.title`). */
export function getDomeTabDisplayTitle(tab: DomeTab, t: TFunction): string {
  switch (tab.type) {
    case 'home':
      return t('tabs.home');
    case 'projects':
      return t('tabs.projects');
    case 'settings':
      return t('tabs.settings');
    case 'calendar':
      return t('tabs.calendar');
    case 'learn':
      return t('tabs.learn');
    case 'marketplace':
      return t('tabs.marketplace');
    case 'agents':
      return t('automationHub.tab_agents');
    case 'workflows':
      return t('automationHub.tab_workflows');
    case 'automations':
      return t('automationHub.tab_automations');
    case 'runs':
      return t('automationHub.tab_runs');
    case 'studio':
      return t('workspace.studio');
    case 'flashcards':
      return t('flashcard.tab_decks');
    case 'tags':
      return t('workspace.tags');
    case 'chat':
      return tab.title?.trim() ? tab.title : t('shell.new_chat');
    case 'transcriptions':
      return t('transcriptions.tab_title');
    case 'transcription-detail':
      return tab.title?.trim() ? tab.title : t('transcriptions.tab_title');
    case 'semantic-graph':
      return tab.title?.trim() ? tab.title : t('semantic_graph.tab_title');
    case 'artifact':
      return tab.title?.trim() ? tab.title : t('chat.artifact_tab');
    default:
      return tab.title;
  }
}
