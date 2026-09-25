import { describe, expect, it } from 'vitest';
import { computeSteps, nextStep, previousStep } from './flow';

const env = { domeEnabled: true, managesPermissions: true };

describe('computeSteps', () => {
  it('runs the full flow for a local user on macOS', () => {
    expect(computeSteps({ account: { mode: 'local' } }, env)).toEqual([
      'account', 'language', 'profile', 'edition', 'ai', 'permissions', 'summary',
    ]);
  });

  it('skips profile when the Dome account already brought a name', () => {
    expect(computeSteps({ account: { mode: 'account', name: 'Ana', email: 'a@b.c' } }, env)).not.toContain('profile');
  });

  it('drops account without Dome provider and permissions off macOS', () => {
    expect(computeSteps({ account: null }, { domeEnabled: false, managesPermissions: false })).toEqual([
      'language', 'profile', 'edition', 'ai', 'summary',
    ]);
  });
});

describe('navigation', () => {
  const steps = computeSteps({ account: null }, env);
  it('moves forward and back within bounds', () => {
    expect(nextStep('ai', steps)).toBe('permissions');
    expect(nextStep('summary', steps)).toBe('summary');
    expect(previousStep('language', steps)).toBe('account');
    expect(previousStep('account', steps)).toBeNull();
  });
});
