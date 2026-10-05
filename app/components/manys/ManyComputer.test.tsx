import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManyComputer from './ManyComputer';
import { request, type CloudMany } from '@/lib/manys/api';

vi.mock('@/lib/manys/api', () => ({ request: vi.fn() }));

// noVNC needs a real canvas and WebCodecs; the panel only needs to hand it a channel and a mode.
const views = vi.hoisted(() => [] as Array<{ channel: unknown; viewOnly: boolean; disconnected: boolean }>);
vi.mock('@novnc/novnc', () => ({
  default: class FakeRfb extends EventTarget {
    viewOnly = false;
    disconnected = false;
    constructor(_target: HTMLElement, public channel: unknown) {
      super();
      views.push(this as unknown as (typeof views)[number]);
      queueMicrotask(() => this.dispatchEvent(new Event('connect')));
    }
    disconnect() { this.disconnected = true; }
    clipboardPasteFrom() {}
  },
}));
const desktopLabel = /computer's desktop|escritorio del ordenador|bureau de l'ordinateur|área de trabalho do computador/i;

const many: CloudMany = { id: 'many-test', name: 'Peregrini', instructions: 'help', grant_revision: 1, grants: { projects: [], resources: [], capabilities: ['vault.read', 'computer.read', 'computer.write'] } };
const perform = vi.fn(async (fn: () => Promise<unknown>) => { await fn(); });
const take = /^(Take control|Tomar el control|Prendre la main|Assumir o controle)$/;
const handBack = /^(Hand back control|Devolver el control|Rendre la main|Devolver o controle)$/;

let power: 'running' | 'stopped';
const listeners: ((event: unknown) => void)[] = [];
const channels: Record<string, string> = {};
const computerOps = () => vi.mocked(request).mock.calls.filter(([path]) => path === '/many-test/computer').map(([, , body]) => (body as { operation: string }).operation);

beforeEach(() => {
  power = 'running';
  perform.mockClear();
  vi.mocked(request).mockReset().mockImplementation(async (_path, _method, body) => {
    const op = (body as { operation?: string } | undefined)?.operation;
    if (op === 'start') power = 'running';
    if (op === 'stop') power = 'stopped';
    return op === 'status' || op === 'start' || op === 'stop' ? { state: power } : {};
  });
  listeners.length = 0;
  views.length = 0;
  (window as unknown as { electron: unknown }).electron = {
    invoke: vi.fn(async (channel: string, payload?: { channel?: string }) => {
      if (channel !== 'manys:channel:open') return { success: true };
      const id = `c-${payload?.channel}`;
      channels[payload?.channel ?? ''] = id;
      return { success: true, data: { channelId: id } };
    }),
    on: (_channel: string, callback: (event: unknown) => void) => { listeners.push(callback); return () => undefined; },
  };
});

describe('the computer panel', () => {
  it('puts the whole desktop first, view only, and says who has the computer, with the way to take it', async () => {
    render(<ManyComputer manyId="many-test" many={many} control="agent" perform={perform} />);
    expect(await screen.findByLabelText(desktopLabel)).toBeInTheDocument();
    await waitFor(() => expect(views).toHaveLength(1));
    expect(views[0].viewOnly).toBe(true);
    expect(window.electron.invoke).toHaveBeenCalledWith('manys:channel:open', { manyId: 'many-test', channel: 'desktop' });
    expect(screen.getByText(/pauses its task|pausa su tarea|met sa tâche en pause|pausa a tarefa/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: take }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: handBack })).toBeNull();
  });

  it('has nothing but the desktop: no terminal, no files, no browser tab', async () => {
    render(<ManyComputer manyId="many-test" many={many} control="agent" perform={perform} />);
    await screen.findByLabelText(desktopLabel);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByText(/Terminal|Archivos|Files|Fichiers|Arquivos/)).toBeNull();
  });

  it('offers to turn the computer on when it is off, and shows the desktop once it is up', async () => {
    power = 'stopped';
    render(<ManyComputer manyId="many-test" many={many} control="agent" perform={perform} />);
    expect(await screen.findByText(/The computer is off|El ordenador está apagado|L'ordinateur est éteint|O computador está desligado/)).toBeInTheDocument();
    expect(screen.queryByLabelText(desktopLabel)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^(Start computer|Encender ordenador|Démarrer l'ordinateur|Iniciar computador)$/ }));
    await waitFor(() => expect(computerOps()).toContain('start'));
    expect(await screen.findByLabelText(desktopLabel)).toBeInTheDocument();
  });

  it('says it is disabled when the permission is off and turns it on from there, with every part', async () => {
    const off = { ...many, grants: { ...many.grants, capabilities: ['vault.read'] } };
    render(<ManyComputer manyId="many-test" many={off} control="agent" perform={perform} />);
    expect(await screen.findByText(/computer is off|ordenador está desactivado|ordinateur est désactivé|computador está desligado/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: take })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^(Turn on computer|Activar ordenador|Activer l'ordinateur|Ligar computador)$/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/many-test', 'PATCH', expect.objectContaining({ grants: expect.objectContaining({ capabilities: ['vault.read', 'computer.read', 'computer.write'], computer: { browser: true, files: true, shell: true } }) })));
  });

  it('takes the wheel and opens the expanded desktop, then hands it back', async () => {
    render(<ManyComputer manyId="many-test" many={many} control="agent" perform={perform} />);
    await screen.findByLabelText(desktopLabel);
    fireEvent.click(screen.getAllByRole('button', { name: take })[0]);
    await waitFor(() => expect(computerOps()).toContain('enter'));
    const viewer = await screen.findByRole('dialog', { name: /Peregrini/ });
    expect(viewer).toHaveTextContent(/Computer|Ordenador|Ordinateur|Computador/);
    expect(screen.getAllByRole('button', { name: handBack }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: handBack })[0]);
    await waitFor(() => expect(computerOps()).toContain('leave'));
    expect(await screen.findAllByText(/fresh capture before it continues|captura nueva antes de continuar|nouvelle capture avant de continuer|nova captura antes de continuar/)).not.toHaveLength(0);
  });

  it('cannot be taken while the computer is off', async () => {
    power = 'stopped';
    render(<ManyComputer manyId="many-test" many={many} control="agent" perform={perform} />);
    await screen.findByText(/The computer is off|El ordenador está apagado/);
    expect(screen.getByRole('button', { name: take })).toBeDisabled();
  });

  it('asks for the wheel again, once, when the computer says it was never taken', async () => {
    render(<ManyComputer manyId="many-test" many={many} control="human" perform={perform} />);
    await screen.findByLabelText(desktopLabel);
    await waitFor(() => expect(channels.desktop).toBeDefined());
    await waitFor(() => expect(views).toHaveLength(1));
    expect(views[0].viewOnly).toBe(false);
    const refuse = () => act(() => listeners.forEach((listener) => listener({ channelId: channels.desktop, type: 'message', data: JSON.stringify({ type: 'error', error: 'take_control_first' }) })));
    refuse();
    await waitFor(() => expect(computerOps().filter((op) => op === 'enter')).toHaveLength(1));
    await waitFor(() => expect(views).toHaveLength(2));
    expect(views[0].disconnected).toBe(true);
    refuse();
    expect(computerOps().filter((op) => op === 'enter')).toHaveLength(1);
  });

  it('stops the computer from its header', async () => {
    render(<ManyComputer manyId="many-test" many={many} control="agent" perform={perform} />);
    await screen.findByLabelText(desktopLabel);
    expect(screen.queryByRole('switch')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^(Stop computer|Apagar ordenador|Arrêter l'ordinateur|Desligar computador)$/ }));
    await waitFor(() => expect(computerOps()).toContain('stop'));
  });
});
