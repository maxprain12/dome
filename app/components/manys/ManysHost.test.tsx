import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManyDetails from './ManyDetails';
import ManysView from './ManysView';
import { ManysHostProvider, type ManyLibraryScopeProps, type ManysHostValue } from './ManysHost';
import { request, type ManyDetail } from '@/lib/manys/api';
import { useLiveRuns } from '@/lib/manys/liveRuns';

vi.mock('@/lib/manys/api', () => ({
  request: vi.fn(),
  delegateToMany: vi.fn(),
  listCloudProviders: vi.fn(async () => []),
  listCloudModels: vi.fn(async () => ({ dome: [], saved: [] })),
  setManyModel: vi.fn(),
}));

const base: ManyDetail = {
  many: { id: 'many-test', name: 'Research', instructions: '', grant_revision: 1, grants: { projects: [], resources: [], capabilities: ['vault.read'] } },
  conversations: [{ id: 'conversation' }], tasks: [], messages: [], actions: [], recurrences: [], conflicts: [], computer: null,
};
const produced: ManyDetail = {
  ...base,
  tasks: [{ id: 'task-done', prompt: 'Report', state: 'completed', question: null, result: { text: 'Done', resources: ['res-1'] } }],
  messages: [{ id: 'u1', role: 'user', content: 'Write the report', task_id: 'task-done' }],
};

const OPEN_RESOURCE = /Open resource|Abrir recurso|Ouvrir la ressource|Abrir recurso/;

beforeEach(() => {
  localStorage.clear();
  useLiveRuns.getState().reset();
  vi.mocked(request).mockReset().mockImplementation(async (path: string) => (path === '' ? { manys: [produced.many] } : path.endsWith('/steps') ? { steps: [] } : produced) as never);
});

const withHost = (host: ManysHostValue | undefined, ui: React.ReactElement) => (host ? <ManysHostProvider value={host}>{ui}</ManysHostProvider> : ui);

describe('the host of the cloud Manys view', () => {
  it('hides the open-resource buttons when the host cannot open resources', async () => {
    render(<ManysView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Research' }));
    expect(await screen.findByText('Write the report')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: OPEN_RESOURCE })).toBeNull();
  });

  it('opens what a Many produced through the host and shows its error code when it fails', async () => {
    const openResource = vi.fn(async (id: string) => { if (id === 'res-1') throw new Error('service_unavailable'); });
    render(withHost({ openResource }, <ManysView />));
    fireEvent.click(await screen.findByRole('button', { name: 'Research' }));
    fireEvent.click(await screen.findByRole('button', { name: OPEN_RESOURCE }));
    await waitFor(() => expect(openResource).toHaveBeenCalledWith('res-1'));
    expect(await screen.findByText(/Could not connect|No se pudo conectar|Impossible de se connecter|Não foi possível ligar/i)).toBeInTheDocument();
  });

  it('shows the library scope only when the host brings one', () => {
    const LibraryScope = ({ many }: ManyLibraryScopeProps) => <div data-testid="library-scope">{many.name}</div>;
    const details = <ManyDetails detail={base} busy={false} perform={async () => undefined} />;
    const alone = render(details);
    expect(screen.queryByTestId('library-scope')).toBeNull();
    alone.unmount();
    render(withHost({ libraryScope: LibraryScope }, details));
    expect(screen.getByTestId('library-scope')).toHaveTextContent('Research');
  });

  it('keeps the library scope out of a Many that cannot read the library', () => {
    const LibraryScope = () => <div data-testid="library-scope" />;
    const noVault: ManyDetail = { ...base, many: { ...base.many, grants: { ...base.many.grants, capabilities: [] } } };
    render(withHost({ libraryScope: LibraryScope }, <ManyDetails detail={noVault} busy={false} perform={async () => undefined} />));
    expect(screen.queryByTestId('library-scope')).toBeNull();
  });
});
