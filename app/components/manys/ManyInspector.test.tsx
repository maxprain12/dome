import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManyInspector from './ManyInspector';
import { request, type ManyDetail } from '@/lib/manys/api';

vi.mock('@/lib/manys/api', () => ({ request: vi.fn() }));

const detail: ManyDetail = {
  many: { id: 'many-test', name: 'Peregrini', instructions: '', grant_revision: 1, grants: { projects: [], resources: [], capabilities: ['vault.read', 'computer.read', 'computer.write'] } },
  conversations: [{ id: 'c' }], tasks: [], messages: [], actions: [], recurrences: [{ id: 'r1', prompt: 'Revisa mis correos cada mañana', next_at: '2026-10-06T07:00:00Z', interval_seconds: 86400 }], conflicts: [], computer: { control: 'agent' },
};

beforeEach(() => {
  vi.mocked(request).mockReset().mockImplementation(async (path: string) => (path.endsWith('/credentials') ? { credentials: [] } : { state: 'running' }) as never);
});
const render_ = (tab: 'details' | 'computer', onTab = vi.fn()) => render(<ManyInspector tab={tab} onTab={onTab} detail={detail} status="idle" busy={false} perform={async () => undefined} />);

describe('the side of a Many', () => {
  it('says who it is and has only two tabs, with real labels', () => {
    render_('details');
    expect(screen.getByRole('heading', { name: 'Peregrini' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    for (const tab of tabs) {
      expect(tab.textContent?.trim()).toBeTruthy();
      expect(tab.textContent).not.toMatch(/returned an object|key '|manys\./i);
    }
    expect(tabs[0]).toHaveTextContent(/Details|Detalles|Détails|Detalhes/);
    expect(tabs[1]).toHaveTextContent(/Computer|Ordenador|Ordinateur|Computador/);
  });

  it('keeps permissions, routines and accesses in one simple column', async () => {
    render_('details');
    expect(screen.getAllByRole('switch')).toHaveLength(4);
    expect(screen.getByText('Revisa mis correos cada mañana')).toBeInTheDocument();
    expect(await screen.findByText(/will ask you for an access|te pedirá un acceso|vous demandera un accès|vai pedir um acesso/)).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Governance|Gobierno|Gouvernance|Governança|Access|Acceso|Context|Contexto/ })).toBeNull();
  });

  it('changes tab', () => {
    const onTab = vi.fn();
    render_('details', onTab);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Computer|Ordenador|Ordinateur|Computador/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Computer|Ordenador|Ordinateur|Computador/ }));
    expect(onTab).toHaveBeenCalledWith('computer');
  });
});
