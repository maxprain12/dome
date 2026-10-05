import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManyInspector, { INSPECTOR_TABS } from './ManyInspector';
import { request, type ManyDetail } from '@/lib/manys/api';

vi.mock('@/lib/manys/api', () => ({ request: vi.fn() }));

const detail: ManyDetail = {
  many: { id: 'many-test', name: 'Peregrini', instructions: '', grant_revision: 1, grants: { projects: [], resources: [], capabilities: ['vault.read', 'computer.read', 'computer.write'] } },
  conversations: [{ id: 'c' }], tasks: [], messages: [], actions: [], recurrences: [], conflicts: [], computer: { control: 'agent' },
};

beforeEach(() => {
  vi.mocked(request).mockReset().mockResolvedValue({ state: 'running' });
});

describe('the inspector tabs', () => {
  it('names every tab with a real label, never an i18n error', () => {
    render(<ManyInspector tab="computer" onTab={() => undefined} detail={detail} busy={false} perform={async () => undefined} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(INSPECTOR_TABS.length).toBeGreaterThan(3);
    for (const tab of tabs) {
      expect(tab.textContent?.trim()).toBeTruthy();
      expect(tab.textContent).not.toMatch(/returned an object|key '|manys\./i);
    }
    expect(tabs[0]).toHaveTextContent(/Computer|Ordenador|Ordinateur|Computador/);
  });

  it('opens the advanced views from Context and offers a way back', () => {
    const onTab = vi.fn();
    const { rerender } = render(<ManyInspector tab="context" onTab={onTab} detail={detail} busy={false} perform={async () => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Access|Acceso|Accès|Acesso/ }));
    expect(onTab).toHaveBeenCalledWith('access');
    rerender(<ManyInspector tab="access" onTab={onTab} detail={detail} busy={false} perform={async () => undefined} />);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /Back to context|Volver a Contexto|Retour au contexte|Voltar ao contexto/ }));
    expect(onTab).toHaveBeenLastCalledWith('context');
  });
});
