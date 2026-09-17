import { describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { resolveStudioPrompts } from './studioPrompts';
import { askStudioMany } from '@/components/studio-hub/askStudioMany';

vi.mock('@/components/studio-hub/askStudioMany', () => ({
  askStudioMany: vi.fn(),
}));

vi.mock('@/lib/store/useManyStore', () => ({
  useManyStore: {
    getState: () => ({ setPendingOneShotSkill: vi.fn() }),
  },
}));

describe('resolveStudioPrompts', () => {
  it('returns human labels without opaque ids', async () => {
    await i18n.changeLanguage('es');
    const items = resolveStudioPrompts({
      surface: 'social',
      socialSection: 'references',
      accountHandle: 'sa-deadbeefcafebabe',
      selectedTitle: 'Ada Lovelace',
      t: i18n.t.bind(i18n),
      onFill: () => {},
    });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.label).not.toMatch(/sa-|sr-|sp-/);
      expect(item.label).not.toMatch(/deadbeef/i);
    }
    expect(items.some((item) => item.id === 'add_competitor')).toBe(true);
  });

  it('prioritizes operations prompts on content', async () => {
    await i18n.changeLanguage('en');
    const items = resolveStudioPrompts({
      surface: 'social',
      socialSection: 'content',
      t: i18n.t.bind(i18n),
      onFill: () => {},
    });
    expect(items.some((item) => item.id === 'improve_hook')).toBe(true);
    expect(items.some((item) => item.id === 'breakdown_post')).toBe(true);
  });

  it('passes an installed skill to Many and never installs implicitly', async () => {
    await i18n.changeLanguage('en');
    const items = resolveStudioPrompts({
      surface: 'social',
      socialSection: 'references',
      t: i18n.t.bind(i18n),
      installedSkillIds: new Set(['dome-social-insights']),
    });
    items.find((item) => item.id === 'add_competitor')?.onClick();
    expect(askStudioMany).toHaveBeenCalledWith(expect.any(String), null, 'dome-social-insights');
  });

  it('does not activate Many when the recommended skill is missing', async () => {
    vi.mocked(askStudioMany).mockClear();
    await i18n.changeLanguage('en');
    const items = resolveStudioPrompts({
      surface: 'social',
      socialSection: 'references',
      t: i18n.t.bind(i18n),
      installedSkillIds: new Set(),
    });
    const add = items.find((item) => item.id === 'add_competitor');
    expect(add?.skillInstalled).toBe(false);
    add?.onClick();
    expect(askStudioMany).not.toHaveBeenCalled();
  });
});
