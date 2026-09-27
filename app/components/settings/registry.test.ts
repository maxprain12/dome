import { describe, expect, it } from 'vitest';
import { SETTINGS_ENTRIES, SETTINGS_GROUPS, resolveSettingsSection } from './registry';

describe('settings registry', () => {
  it('keeps every destination in exactly one task group', () => {
    const ids = SETTINGS_GROUPS.flatMap((group) => group.entries.map((entry) => entry.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(19);
    expect(SETTINGS_GROUPS.find((group) => group.labelKey === 'settingsGuide.groups.intelligence')?.entries.map((entry) => entry.id)).toEqual(['ai', 'kb_llm', 'indexing']);
  });

  it('resolves legacy aliases without duplicating a visible section', () => {
    expect(resolveSettingsSection('transcription')).toBe('ai');
    expect(resolveSettingsSection('unknown')).toBe('general');
    expect(new Set(SETTINGS_ENTRIES.map((entry) => entry.id)).size).toBe(SETTINGS_ENTRIES.length);
    expect(SETTINGS_ENTRIES.map((entry) => entry.id)).toContain('browser_extension');
    expect(SETTINGS_ENTRIES.map((entry) => entry.id)).toContain('remote_many');
  });
});

it('provides a readable explanation and first step for every section in every language', async () => {
  const { default: i18n } = await import('@/lib/i18n');
  for (const entry of SETTINGS_ENTRIES) {
    for (const lng of ['en', 'es', 'fr', 'pt']) {
      expect(i18n.exists(`settingsGuide.sections.${entry.id}.description`, { lng })).toBe(true);
      expect(i18n.exists(`settingsGuide.sections.${entry.id}.start`, { lng })).toBe(true);
    }
  }
});
