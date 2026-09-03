import { describe, expect, it } from 'vitest';
import { TOGGLEABLE_FEATURE_KEYS } from '@/lib/features/featureKeys';
import {
  DEFAULT_EDITION,
  EDITION_IDS,
  EDITION_PRESETS,
  NAV_ITEM_ORDER,
  expectedNavKeys,
  fillMissingVisibility,
  getEdition,
  resolveEditionId,
  visibilityForEdition,
  visibleNavKeys,
} from './catalog';

describe('edition catalog', () => {
  it('caps the suite at three named editions with pro as default', () => {
    expect(EDITION_IDS).toEqual(['pro', 'study', 'dev']);
    expect(DEFAULT_EDITION).toBe('pro');
    expect(EDITION_PRESETS.map((edition) => edition.id)).toEqual([...EDITION_IDS]);
  });

  it('migrates legacy onboarding roles onto the three editions', () => {
    expect(resolveEditionId('developer')).toBe('dev');
    expect(resolveEditionId('research')).toBe('pro');
    expect(resolveEditionId('generalist')).toBe('pro');
    expect(resolveEditionId('study')).toBe('study');
    expect(resolveEditionId(null)).toBe('pro');
    expect(getEdition('developer').id).toBe('dev');
  });

  it('turns off every toggleable key not listed on the edition', () => {
    for (const edition of EDITION_PRESETS) {
      const visibility = visibilityForEdition(edition.id);
      expect(Object.keys(visibility).sort((a, b) => a.localeCompare(b))).toEqual(
        [...TOGGLEABLE_FEATURE_KEYS].sort((a, b) => a.localeCompare(b)),
      );
      for (const key of TOGGLEABLE_FEATURE_KEYS) {
        expect(visibility[key]).toBe(edition.modules.includes(key));
      }
    }
  });

  it('matches the Pro two-pole nav contract', () => {
    expect(expectedNavKeys('pro')).toEqual([
      'library',
      'projects',
      'people',
      'email',
      'social',
      'agents',
      'marketplace',
    ]);
  });

  it('matches the Study nav contract', () => {
    expect(expectedNavKeys('study')).toEqual([
      'library',
      'projects',
      'calendar',
      'learn',
      'marketplace',
    ]);
  });

  it('matches the Dev nav contract', () => {
    expect(expectedNavKeys('dev')).toEqual([
      'library',
      'projects',
      'github',
      'agents',
      'marketplace',
    ]);
  });

  it('does not leak new modules onto an edition that omitted them', () => {
    const stored = visibilityForEdition('study');
    delete stored.people;
    const filled = fillMissingVisibility('study', stored);
    expect(filled.people).toBe(false);
    expect(visibleNavKeys(filled)).not.toContain('people');
    expect(visibleNavKeys(filled)).toContain('learn');
  });

  it('keeps NAV_ITEM_ORDER as the single sidebar sequence', () => {
    expect(NAV_ITEM_ORDER[0]).toBe('library');
    expect(NAV_ITEM_ORDER).toContain('people');
    expect(NAV_ITEM_ORDER).toContain('social');
    expect(NAV_ITEM_ORDER).toContain('agents');
  });
});
