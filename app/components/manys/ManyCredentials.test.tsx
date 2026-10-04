import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManyCredentials from './ManyCredentials';
import ManyReview from './ManyReview';
import { request, type Credential, type ManyDetail } from '@/lib/manys/api';

vi.mock('@/lib/manys/api', () => ({ request: vi.fn() }));

const saved: Credential = { id: 'cred-1', many_id: 'many-test', label: 'Work mail', username: 'ana', hosts: ['accounts.example.com'], created_at: '2026-10-05T10:00:00Z', last_used_at: null };

beforeEach(() => {
  vi.mocked(request).mockImplementation(async (_path: string, method?: string) => (method === undefined || method === 'GET' ? { credentials: [saved] } : {}) as never);
});

describe('ManyCredentials', () => {
  it('lists saved sign-ins without any secret', async () => {
    render(<ManyCredentials manyId="many-test" />);
    expect(await screen.findByText('Work mail')).toBeInTheDocument();
    expect(screen.getByText(/ana · accounts\.example\.com/)).toBeInTheDocument();
  });

  it('sends the secret once, then clears the field', async () => {
    render(<ManyCredentials manyId="many-test" />);
    fireEvent.change(await screen.findByLabelText(/^(Name|Nombre|Nom)$/), { target: { value: 'Bank' } });
    fireEvent.change(screen.getByLabelText(/^(Password or key|Contraseña o clave|Mot de passe ou clé|Palavra-passe ou chave)$/), { target: { value: 'hunter2' } });
    fireEvent.change(screen.getByLabelText(/^(Websites where it works|Sitios web donde vale|Sites web concernés|Sites onde serve)$/), { target: { value: 'bank.example.com, *.bank.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^(Save sign-in|Guardar acceso|Enregistrer la connexion|Guardar acesso)$/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/many-test/credentials', 'POST', {
      scope: 'many', label: 'Bank', secret: 'hunter2', hosts: ['bank.example.com', '*.bank.example.com'],
    }));
    await waitFor(() => expect(screen.getByLabelText(/^(Password or key|Contraseña o clave|Mot de passe ou clé|Palavra-passe ou chave)$/)).toHaveValue(''));
  });

  it('keeps the secret out of the screen when it explains a failure', async () => {
    vi.mocked(request).mockImplementation(async (_path: string, method?: string) => {
      if (method === 'POST') throw new Error('credentials_unconfigured');
      return { credentials: [] } as never;
    });
    render(<ManyCredentials manyId="many-test" />);
    fireEvent.change(await screen.findByLabelText(/^(Name|Nombre|Nom)$/), { target: { value: 'Bank' } });
    fireEvent.change(screen.getByLabelText(/^(Password or key|Contraseña o clave|Mot de passe ou clé|Palavra-passe ou chave)$/), { target: { value: 'hunter2' } });
    fireEvent.change(screen.getByLabelText(/^(Websites where it works|Sitios web donde vale|Sites web concernés|Sites onde serve)$/), { target: { value: 'bank.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^(Save sign-in|Guardar acceso|Enregistrer la connexion|Guardar acesso)$/ }));
    expect(await screen.findByText(/not set up on the server|no está configurado en el servidor|pas encore configuré|ainda não está configurado/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('hunter2');
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
