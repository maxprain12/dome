import { expect, it } from 'vitest';
import { SETTINGS_GROUPS } from './registry';
import { defaultSettingsGroups } from './settingsDisclosure';

it('opens common groups when the active section leaves enough vertical space', () => {
  const roomy = defaultSettingsGroups(SETTINGS_GROUPS, 'browser_extension', 740);
  expect([...roomy]).toEqual(['settings.groups.appearance_language', 'settings.groups.integrations']);
  const compact = defaultSettingsGroups(SETTINGS_GROUPS, 'browser_extension', 430);
  expect(compact.size).toBe(0);
});

it('prioritizes appearance and does not duplicate the active group in its height budget', () => {
  expect([...defaultSettingsGroups(SETTINGS_GROUPS, 'browser_extension', 520)]).toEqual(['settings.groups.appearance_language']);
  expect(defaultSettingsGroups(SETTINGS_GROUPS, 'appearance', 560).has('settings.groups.integrations')).toBe(true);
});
