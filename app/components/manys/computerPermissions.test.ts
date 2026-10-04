import { describe, expect, it } from 'vitest';
import type { Grants } from '@/lib/manys/api';
import { computerAllows, computerEnabled, withComputerEnabled, withComputerKind, withPaused } from './computerPermissions';

const base: Grants = { projects: [], resources: [], capabilities: ['vault.read'] };

describe('computer permissions', () => {
  it('is off until the capabilities are granted, and on for everything once they are', () => {
    expect(computerEnabled(base)).toBe(false);
    expect(computerAllows(base, 'browser')).toBe(false);
    const on = withComputerEnabled(base, true);
    expect(on.capabilities).toEqual(['vault.read', 'computer.read', 'computer.write']);
    expect(['browser', 'files', 'shell'].every((kind) => computerAllows(on, kind as 'browser'))).toBe(true);
  });

  it('turns the computer off by removing both capabilities and keeps the others', () => {
    const off = withComputerEnabled(withComputerEnabled(base, true), false);
    expect(off.capabilities).toEqual(['vault.read']);
    expect(withComputerEnabled(withComputerEnabled(base, true), true).capabilities.filter((c) => c === 'computer.read')).toHaveLength(1);
  });

  it('switches one kind without touching the others', () => {
    const grants = withComputerKind(withComputerEnabled(base, true), 'shell', false);
    expect(grants.computer).toEqual({ browser: true, files: true, shell: false });
    expect(computerAllows(grants, 'shell')).toBe(false);
    expect(computerAllows(grants, 'files')).toBe(true);
    expect(withComputerKind(grants, 'shell', true).computer?.shell).toBe(true);
  });

  it('pauses and resumes without losing anything else', () => {
    const paused = withPaused(withComputerKind(base, 'files', false), true);
    expect(paused.paused).toBe(true);
    expect(paused.computer?.files).toBe(false);
    expect(withPaused(paused, false).paused).toBe(false);
  });
});
