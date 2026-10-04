import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManyComputer from './ManyComputer';
import { request, type CloudMany } from '@/lib/manys/api';

vi.mock('@/lib/manys/api', () => ({ request: vi.fn() }));

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
  it('puts the screen first and says who has the computer, with the way to take it', async () => {
    render(<ManyComputer manyId="many-test" many={many} control="agent" perform={perform} />);
    expect(await screen.findByLabelText(/Live computer screen|Pantalla del ordenador en vivo|Écran de l'ordinateur en direct|Tela do computador ao vivo/)).toBeInTheDocument();
    expect(screen.getByText(/pauses its task|pausa su tarea|met sa tâche en pause|pausa a tarefa/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: take }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: handBack })).toBeNull();
  });

  it('offers to turn the computer on when it is off, and shows the screen once it is up', async () => {
    power = 'stopped';
    render(<ManyComputer manyId="many-test" many={many} control="agent" perform={perform} />);
    expect(await screen.findByText(/The computer is off|El ordenador está apagado|L'ordinateur est éteint|O computador está desligado/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Live computer screen|Pantalla del ordenador en vivo/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^(Start computer|Encender ordenador|Démarrer l'ordinateur|Iniciar computador)$/ }));
    await waitFor(() => expect(computerOps()).toContain('start'));
    expect(await screen.findByLabelText(/Live computer screen|Pantalla del ordenador en vivo|Écran de l'ordinateur en direct|Tela do computador ao vivo/)).toBeInTheDocument();
  });

  it('takes the wheel and opens the expanded screen, then hands it back', async () => {
    render(<ManyComputer manyId="many-test" many={many} control="agent" perform={perform} />);
    await screen.findByLabelText(/Live computer screen|Pantalla del ordenador en vivo/);
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

  it('asks for the wheel again, once, when the computer says it was never taken, and tells the person in their language', async () => {
    render(<ManyComputer manyId="many-test" many={many} control="human" perform={perform} />);
    await screen.findByLabelText(/computer screen|pantalla del ordenador|écran de l'ordinateur|tela do computador/i);
    await waitFor(() => expect(channels.stream).toBeDefined());
    const refuse = () => act(() => listeners.forEach((listener) => listener({ channelId: channels.stream, type: 'message', data: JSON.stringify({ type: 'error', error: 'Take control before driving the computer yourself.' }) })));
    refuse();
    await waitFor(() => expect(computerOps().filter((op) => op === 'enter')).toHaveLength(1));
    refuse();
    expect(computerOps().filter((op) => op === 'enter')).toHaveLength(1);
    expect(screen.queryByText(/Take control before driving/)).toBeNull();
  });

  it('shows the terminal only to whoever holds the wheel', async () => {
    render(<ManyComputer manyId="many-test" many={many} control="agent" perform={perform} />);
    expect(await screen.findByText(/The terminal is yours|El terminal es tuyo|Le terminal est à vous|O terminal é seu/)).toBeInTheDocument();
  });

  it('says where a permission is off and switches it back on from there', async () => {
    const restricted = { ...many, grants: { ...many.grants, computer: { browser: true, files: false, shell: false } } };
    render(<ManyComputer manyId="many-test" many={restricted} control="human" perform={perform} />);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /Files|Archivos|Fichiers|Arquivos/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Files|Archivos|Fichiers|Arquivos/ }));
    expect(await screen.findByText(/Files are off|Los archivos están desactivados|Les fichiers sont désactivés|Os arquivos estão desativados/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /^(Allow|Permitir|Autoriser)$/ })[0]);
    await waitFor(() => expect(request).toHaveBeenCalledWith('/many-test', 'PATCH', expect.objectContaining({ grants: expect.objectContaining({ computer: { browser: true, files: true, shell: false } }) })));
  });

  it('keeps permissions and power behind the gear, and saves each switch in the grants', async () => {
    render(<ManyComputer manyId="many-test" many={many} control="agent" perform={perform} />);
    await screen.findByLabelText(/Live computer screen|Pantalla del ordenador en vivo/);
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Computer permissions|Permisos del ordenador|Autorisations de l'ordinateur|Permissões do computador/ }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Terminal commands|Comandos de terminal|Commandes du terminal/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/many-test', 'PATCH', expect.objectContaining({ grants: expect.objectContaining({ computer: { browser: true, files: true, shell: false } }) })));
    fireEvent.click(screen.getByRole('checkbox', { name: /Enable this computer|Activar este ordenador|Activer cet ordinateur|Ativar este computador/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/many-test', 'PATCH', expect.objectContaining({ grants: expect.objectContaining({ capabilities: ['vault.read'] }) })));
  });

  it('stops the computer from the settings', async () => {
    render(<ManyComputer manyId="many-test" many={many} control="agent" perform={perform} />);
    await screen.findByLabelText(/Live computer screen|Pantalla del ordenador en vivo/);
    fireEvent.click(screen.getByRole('button', { name: /Computer permissions|Permisos del ordenador|Autorisations de l'ordinateur|Permissões do computador/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^(Stop computer|Apagar ordenador|Arrêter l'ordinateur|Desligar computador)$/ }));
    await waitFor(() => expect(computerOps()).toContain('stop'));
  });
});
