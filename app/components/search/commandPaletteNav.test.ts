import { describe, expect, it } from 'vitest';
import { visibilityForEdition } from '@/lib/editions/catalog';
import { isFeatureVisible } from '@/lib/features/featureKeys';
import { buildNavigationDestinations } from './commandPaletteNav';

function destKeys(editionId: 'pro' | 'study' | 'dev'): string[] {
  const visibility = visibilityForEdition(editionId);
  const rows = buildNavigationDestinations({
    t: (key) => key,
    navVisible: (key) => isFeatureVisible(visibility, key),
    close: () => {},
    goHome: () => {},
    openProjectsTab: () => {},
    openCalendarTab: () => {},
    openGitHubTab: () => {},
    openEmailTab: () => {},
    openPeopleTab: () => {},
    openSocialTab: () => {},
    openPipelinesTab: () => {},
    openAgentsTab: () => {},
    openWorkflowsTab: () => {},
    openAutomationsTab: () => {},
    openRunsTab: () => {},
    openLearnTab: () => {},
    openMarketplaceTab: () => {},
    openSettingsTab: () => {},
  });
  return rows.map((row) => row.id.replace(/^nav:/, ''));
}

describe('command palette destinations follow the edition catalog', () => {
  it('shows Pro poles and channels, not Learn', () => {
    expect(destKeys('pro')).toEqual([
      'library',
      'projects',
      'people',
      'email',
      'social',
      'agents',
      'marketplace',
      'settings',
    ]);
  });

  it('shows Study learn surface, not People or Social', () => {
    expect(destKeys('study')).toEqual([
      'library',
      'projects',
      'calendar',
      'learn',
      'marketplace',
      'settings',
    ]);
  });

  it('shows Dev GitHub and agents, not Learn', () => {
    expect(destKeys('dev')).toEqual([
      'library',
      'projects',
      'github',
      'agents',
      'marketplace',
      'settings',
    ]);
  });
});
