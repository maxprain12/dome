import { describe, expect, it } from 'vitest';
import { composerModeIslandClass, composerModeSwitcherClass } from './composerMode';

describe('composerMode', () => {
  it('tints the island and chip for plan and draft', () => {
    expect(composerModeIslandClass('plan')).toContain('bg-brand-lavender');
    expect(composerModeIslandClass('draft')).toContain('bg-brand-mint');
    expect(composerModeIslandClass('agent')).toBe('');
    expect(composerModeSwitcherClass('plan')).toContain('bg-brand-lavender');
    expect(composerModeSwitcherClass('draft')).toContain('bg-brand-mint');
    expect(composerModeSwitcherClass('agent')).toBe('');
  });
});
