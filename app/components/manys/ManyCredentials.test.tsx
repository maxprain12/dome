import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManyCredentialForm from './ManyCredentialForm';
import ManyCredentials from './ManyCredentials';
import ManyReview from './ManyReview';
import { request, type Credential, type ManyDetail } from '@/lib/manys/api';

vi.mock('@/lib/manys/api', () => ({ request: vi.fn() }));

const saved: Credential = { id: 'cred-1', many_id: 'many-test', label: 'Work mail', username: 'ana', hosts: ['accounts.example.com'], created_at: '2026-10-05T10:00:00Z', last_used_at: null };

beforeEach(() => {
  vi.mocked(request).mockReset().mockImplementation(async (_path: string, method?: string) => (method === undefined || method === 'GET' ? { credentials: [saved] } : {}) as never);
});

describe('ManyCredentials', () => {
  it('lists saved accesses without any secret and without a form to add one', async () => {
    render(<ManyCredentials manyId="many-test" />);
    expect(await screen.findByText('Work mail')).toBeInTheDocument();
    expect(screen.getByText(/ana · accounts\.example\.com/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Password|Contraseña|Mot de passe|Palavra-passe/)).toBeNull();
  });

  it('removes an access', async () => {
    render(<ManyCredentials manyId="many-test" />);
    fireEvent.click(await screen.findByRole('button', { name: /Work mail/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/many-test/credentials/cred-1', 'DELETE'));
  });

  it('says the Many will ask when there is none', async () => {
    vi.mocked(request).mockResolvedValue({ credentials: [] } as never);
    render(<ManyCredentials manyId="many-test" />);
    expect(await screen.findByText(/will ask you for an access|te pedirá un acceso|vous demandera un accès|vai pedir um acesso/)).toBeInTheDocument();
  });
});

describe('ManyCredentialForm', () => {
  const secretField = () => screen.getByLabelText(/^(Password or key|Contraseña o clave|Mot de passe ou clé|Palavra-passe ou chave)$/);

  it('hands over what was typed, with the sites split, and clears the secret at once', async () => {
    const onSubmit = vi.fn();
    render(<ManyCredentialForm busy={false} submitLabel="Save" onSubmit={onSubmit} defaults={{ label: 'Instagram', hosts: 'instagram.com, *.instagram.com' }} />);
    fireEvent.change(screen.getByLabelText(/^(Username|Usuario|Identifiant|Utilizador)$/), { target: { value: 'ana' } });
    fireEvent.change(secretField(), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ label: 'Instagram', username: 'ana', secret: 'hunter2', hosts: ['instagram.com', '*.instagram.com'], everyMany: false }));
    expect(secretField()).toHaveValue('');
    expect(document.body.textContent).not.toContain('hunter2');
  });

  it('cannot be sent without a name, a secret and a site', () => {
    render(<ManyCredentialForm busy={false} submitLabel="Save" onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('approval card', () => {
  it('shows a saved sign-in instead of its placeholder', () => {
    const detail = {
      many: { id: 'many-test', name: 'R', instructions: '', grant_revision: 1, grants: { projects: [], resources: [], capabilities: [] } },
      conversations: [], tasks: [], messages: [], recurrences: [], computer: null, conflicts: [],
      actions: [{ id: 'a', digest: 'd', state: 'pending', expires_at: new Date(Date.now() + 600000).toISOString(), receipt: null,
        proposal: { capability: 'computer.write', tool: 'computer', parameters: { operation: 'type', parameters: { text: '{{credential:11111111-1111-4111-8111-111111111111}}' } } } }],
    } as unknown as ManyDetail;
    render(<ManyReview detail={detail} busy={false} perform={async () => undefined} />);
    expect(screen.queryByText(/\{\{credential/)).toBeNull();
    expect(screen.getAllByText(/a saved sign-in|un acceso guardado|une connexion enregistrée|um acesso guardado/).length).toBeGreaterThan(0);
  });
});
