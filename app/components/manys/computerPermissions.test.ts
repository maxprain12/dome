import { describe, expect, it } from 'vitest';
import type { Grants } from '@/lib/manys/api';
import { OUTSIDE_CAPABILITIES, computerEnabled, outsideEnabled, withCapabilities, withComputerOn, withPaused } from './computerPermissions';

const base: Grants = { projects: [], resources: [], capabilities: ['vault.read'] };

describe('computer permissions', () => {
  it('is off until both capabilities are granted', () => {
    expect(computerEnabled(base)).toBe(false);
    expect(computerEnabled({ ...base, capabilities: ['computer.read'] })).toBe(false);
    expect(computerEnabled(withComputerOn(base, true))).toBe(true);
  });

  it('turns the whole machine on or off, keeps the other capabilities and never duplicates', () => {
    const on = withComputerOn(base, true);
    expect(on.capabilities).toEqual(['vault.read', 'computer.read', 'computer.write']);
    expect(on.computer).toEqual({ browser: true, files: true, shell: true });
    expect(withComputerOn(on, true).capabilities.filter((capability) => capability === 'computer.read')).toHaveLength(1);
    expect(withComputerOn(on, false).capabilities).toEqual(['vault.read']);
  });

  it('gives back every part when it is turned on again after parts had been switched off', () => {
    const partial: Grants = { ...base, capabilities: [], computer: { browser: true, files: false, shell: false } };
    expect(withComputerOn(partial, true).computer).toEqual({ browser: true, files: true, shell: true });
  });

  it('pauses and resumes without losing anything else', () => {
    const paused = withPaused(withComputerOn(base, true), true);
    expect(paused.paused).toBe(true);
    expect(paused.capabilities).toContain('computer.write');
    expect(withPaused(paused, false).paused).toBe(false);
  });
});

describe('capability switches', () => {
  it('adds and removes capabilities without duplicating or losing the others', () => {
    const on = withCapabilities(base, ['web.read'], true);
    expect(on.capabilities).toEqual(['vault.read', 'web.read']);
    expect(withCapabilities(on, ['web.read'], true).capabilities).toEqual(['vault.read', 'web.read']);
    expect(withCapabilities(on, ['web.read'], false).capabilities).toEqual(['vault.read']);
  });

  it('reads the outside switch as on when any of the four is granted', () => {
    expect(outsideEnabled(base)).toBe(false);
    expect(outsideEnabled(withCapabilities(base, ['external.purchase'], true))).toBe(true);
    expect(withCapabilities(withCapabilities(base, OUTSIDE_CAPABILITIES, true), OUTSIDE_CAPABILITIES, false).capabilities).toEqual(['vault.read']);
  });
});
