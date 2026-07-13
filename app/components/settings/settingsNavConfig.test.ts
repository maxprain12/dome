import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, SETTINGS_REGISTRY, resolveSettingsSection } from './settingsNavConfig';

describe('settings registry', () => {
  it('keeps the seven agreed information-architecture groups', () => {
    expect(NAV_GROUPS.map((group) => group.labelKey)).toEqual([
      'settings.groups.account',
      'settings.groups.appearance_language',
      'settings.groups.ai',
      'settings.groups.integrations',
      'settings.groups.automation_extensions',
      'settings.groups.data_privacy',
      'settings.groups.system',
    ]);
  });

  it('resolves legacy aliases without duplicating a visible section', () => {
    expect(resolveSettingsSection('transcription')).toBe('ai');
    expect(resolveSettingsSection('unknown')).toBe('general');
    expect(new Set(SETTINGS_REGISTRY.map((entry) => entry.id)).size).toBe(SETTINGS_REGISTRY.length);
  });
});
