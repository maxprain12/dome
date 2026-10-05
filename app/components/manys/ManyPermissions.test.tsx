import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Grants } from '@/lib/manys/api';
import ManyPermissions from './ManyPermissions';

const grants = (capabilities: string[], extra: Partial<Grants> = {}): Grants => ({ projects: [], resources: [], capabilities, ...extra });
const named = (pattern: RegExp) => screen.getByRole('switch', { name: pattern });
const off = (element: HTMLElement) => element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
const last = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.at(-1)?.[0] as Grants;
const LIBRARY = /My library|Mi biblioteca|Ma bibliothèque|Minha biblioteca/;
const WEB = /^(The web|Internet|Le web|A web)/;
const COMPUTER = /Its computer|Su ordenador|Son ordinateur|O computador dele/;
const OUTSIDE = /Act outside Dome|Actuar fuera de Dome|Agir en dehors de Dome|Agir fora do Dome/;

describe('ManyPermissions', () => {
  it('is four switches: library, web, computer and acting outside', () => {
    render(<ManyPermissions grants={grants(['vault.read'])} busy={false} onChange={vi.fn()} />);
    expect(screen.getAllByRole('switch')).toHaveLength(4);
    expect(named(LIBRARY)).toBeChecked();
    expect(named(WEB)).not.toBeChecked();
    expect(named(COMPUTER)).not.toBeChecked();
    expect(named(OUTSIDE)).not.toBeChecked();
  });

  it('applies each switch at once and keeps everything else', () => {
    const onChange = vi.fn();
    render(<ManyPermissions grants={grants(['vault.read'], { projects: ['p1'] })} busy={false} onChange={onChange} />);
    fireEvent.click(named(WEB));
    expect(last(onChange)).toMatchObject({ projects: ['p1'], capabilities: ['vault.read', 'web.read'] });
    fireEvent.click(named(LIBRARY));
    expect(last(onChange).capabilities).toEqual([]);
  });

  it('gives the library as one switch: read and edit together', () => {
    const onChange = vi.fn();
    render(<ManyPermissions grants={grants([])} busy={false} onChange={onChange} />);
    fireEvent.click(named(LIBRARY));
    expect(last(onChange).capabilities).toEqual(['vault.read', 'vault.write']);
  });

  it('gives the whole computer or none of it', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ManyPermissions grants={grants([])} busy={false} onChange={onChange} />);
    fireEvent.click(named(COMPUTER));
    expect(last(onChange).capabilities).toEqual(['computer.read', 'computer.write']);
    expect(last(onChange).computer).toEqual({ browser: true, files: true, shell: true });
    rerender(<ManyPermissions grants={grants(['computer.read', 'computer.write'])} busy={false} onChange={onChange} />);
    expect(named(COMPUTER)).toBeChecked();
    fireEvent.click(named(COMPUTER));
    expect(last(onChange).capabilities).toEqual([]);
  });

  it('grants and revokes sending, publishing, buying and deleting together', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ManyPermissions grants={grants([])} busy={false} onChange={onChange} />);
    fireEvent.click(named(OUTSIDE));
    expect(last(onChange).capabilities).toEqual(['external.send', 'external.publish', 'external.purchase', 'external.delete']);
    rerender(<ManyPermissions grants={grants(['external.send', 'vault.read'])} busy={false} onChange={onChange} />);
    expect(named(OUTSIDE)).toBeChecked();
    fireEvent.click(named(OUTSIDE));
    expect(last(onChange).capabilities).toEqual(['vault.read']);
  });

  it('cannot be changed while a change is being saved', () => {
    render(<ManyPermissions grants={grants([])} busy onChange={vi.fn()} />);
    expect(screen.getAllByRole('switch').every(off)).toBe(true);
  });
});
