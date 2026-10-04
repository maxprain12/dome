import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Grants } from '@/lib/manys/api';
import ManyPermissions from './ManyPermissions';

const grants = (capabilities: string[], extra: Partial<Grants> = {}): Grants => ({ projects: [], resources: [], capabilities, ...extra });
const named = (pattern: RegExp) => screen.getByRole('switch', { name: pattern });
const off = (element: HTMLElement) => element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
const last = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.at(-1)?.[0] as Grants;

describe('ManyPermissions', () => {
  it('has one switch for each thing a Many may do, in plain words', () => {
    render(<ManyPermissions grants={grants(['vault.read'])} busy={false} onChange={vi.fn()} />);
    expect(screen.getAllByRole('switch')).toHaveLength(8);
    expect(named(/^(Read|Leer|Lire|Ler)/)).toBeChecked();
    expect(named(/^(Edit|Editar|Modifier|Editar)/)).not.toBeChecked();
    expect(named(/Send, publish, buy and delete|Enviar, publicar, comprar y borrar/)).not.toBeChecked();
  });

  it('applies each switch at once and keeps everything else', () => {
    const onChange = vi.fn();
    render(<ManyPermissions grants={grants(['vault.read'], { projects: ['p1'] })} busy={false} onChange={onChange} />);
    fireEvent.click(named(/Research the web|Investigar en la web/));
    expect(last(onChange)).toMatchObject({ projects: ['p1'], capabilities: ['vault.read', 'web.read'] });
    fireEvent.click(named(/^(Read|Leer|Lire|Ler)/));
    expect(last(onChange).capabilities).toEqual([]);
  });

  it('grants and revokes sending, publishing, buying and deleting together', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ManyPermissions grants={grants([])} busy={false} onChange={onChange} />);
    fireEvent.click(named(/Send, publish, buy and delete|Enviar, publicar, comprar y borrar/));
    expect(last(onChange).capabilities).toEqual(['external.send', 'external.publish', 'external.purchase', 'external.delete']);
    rerender(<ManyPermissions grants={grants(['external.send', 'vault.read'])} busy={false} onChange={onChange} />);
    expect(named(/Send, publish, buy and delete|Enviar, publicar, comprar y borrar/)).toBeChecked();
    fireEvent.click(named(/Send, publish, buy and delete|Enviar, publicar, comprar y borrar/));
    expect(last(onChange).capabilities).toEqual(['vault.read']);
  });

  it('puts the computer on and off as one, and its three parts only while it is on', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ManyPermissions grants={grants([])} busy={false} onChange={onChange} />);
    for (const part of [/Browser|Navegador|Navigateur|Navegador/, /Workspace files|Archivos del espacio|Fichiers de l'espace|Arquivos do espaço/, /Terminal commands|Comandos de terminal|Commandes du terminal|Comandos de terminal/]) {
      expect(off(named(part))).toBe(true);
    }
    fireEvent.click(named(/Use its computer|Usar su ordenador|Utiliser son ordinateur|Usar o computador/));
    expect(last(onChange).capabilities).toEqual(['computer.read', 'computer.write']);
    rerender(<ManyPermissions grants={grants(['computer.read', 'computer.write'])} busy={false} onChange={onChange} />);
    fireEvent.click(named(/Terminal commands|Comandos de terminal|Commandes du terminal/));
    expect(last(onChange).computer).toEqual({ browser: true, files: true, shell: false });
  });

  it('cannot be changed while a change is being saved', () => {
    render(<ManyPermissions grants={grants([])} busy onChange={vi.fn()} />);
    expect(screen.getAllByRole('switch').every(off)).toBe(true);
  });
});
