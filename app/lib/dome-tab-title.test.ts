import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { getDomeTabDisplayTitle } from './dome-tab-title';

describe('getDomeTabDisplayTitle', () => {
  it('localizes permanent destinations but preserves transient titles', () => {
    const t = ((key: string) => `i18n:${key}`) as TFunction;
    expect(getDomeTabDisplayTitle({ id: 'settings', type: 'settings', title: 'legacy' }, t)).toBe('i18n:tabs.settings');
    expect(getDomeTabDisplayTitle({ id: 'note:1', type: 'note', title: 'Mi nota' }, t)).toBe('Mi nota');
  });
});
