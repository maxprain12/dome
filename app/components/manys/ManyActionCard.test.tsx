import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManyActionCard from './ManyActionCard';
import { request, type Action } from '@/lib/manys/api';

vi.mock('@/lib/manys/api', () => ({ request: vi.fn() }));

const future = new Date(Date.now() + 30 * 60_000).toISOString();
const action = (state: string, extra: Partial<Action> = {}): Action => ({
  id: 'act-1', digest: 'd'.repeat(64), state, expires_at: future, receipt: null, operation_id: 'op-1', task_id: 't1',
  proposal: { capability: 'external.send', tool: 'computer', parameters: { operation: 'type', parameters: { text: 'hello {{credential:11111111-1111-4111-8111-111111111111}}' } } },
  ...extra,
});
const perform = vi.fn(async (fn: () => Promise<unknown>) => { await fn(); });
const approve = /^(Approve|Aprobar|Approuver|Aprovar)$/;
const reject = /^(Reject|Rechazar|Rejeter|Rejeitar)$/;

beforeEach(() => { vi.mocked(request).mockReset().mockResolvedValue({}); perform.mockClear(); });

describe('ManyActionCard', () => {
  it('asks for a decision while pending and sends the digest it was shown', async () => {
    render(<ManyActionCard action={action('pending')} many="many-1" busy={false} perform={perform} />);
    fireEvent.click(screen.getByRole('button', { name: approve }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/many-1/actions/act-1', 'PATCH', { approve: true, digest: 'd'.repeat(64) }));
    fireEvent.click(screen.getByRole('button', { name: reject }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/many-1/actions/act-1', 'PATCH', { approve: false, digest: 'd'.repeat(64) }));
  });

  it('never shows a saved credential value, only that one is used', () => {
    render(<ManyActionCard action={action('pending')} many="many-1" busy={false} perform={perform} />);
    expect(screen.queryByText(/11111111-1111/)).toBeNull();
    expect(screen.getByText(/hello (un acceso guardado|a saved sign-in|un accès enregistré|um acesso salvo)/i)).toBeInTheDocument();
  });

  it.each([
    [{ operation: 'navigate', parameters: { url: 'https://www.instagram.com/accounts/login/?next=/' } }, /Open www\.instagram\.com\/accounts\/login\/|Abrir www\.instagram\.com\/accounts\/login\//],
    [{ operation: 'click', parameters: { ref: 'e12' } }, /Click on the page|Hacer clic en la página/],
    [{ operation: 'exec', parameters: { command: 'ls /workspace' } }, /Run ls \/workspace|Ejecutar ls \/workspace/],
  ])('says in a sentence what it will do: %j', (parameters, sentence) => {
    render(<ManyActionCard action={action('pending', { proposal: { capability: 'computer.write', tool: 'computer', parameters } })} many="many-1" busy={false} perform={perform} />);
    expect(screen.getByText(sentence)).toBeInTheDocument();
    expect(screen.queryByText(/ref|operation/i)).toBeNull();
  });

  it('falls back to what the capability is when it does not recognise the operation', () => {
    render(<ManyActionCard action={action('pending', { proposal: { capability: 'external.publish', tool: 'mail', parameters: { to: 'a@b.c' } } })} many="many-1" busy={false} perform={perform} />);
    expect(screen.getAllByText(/Publish|Publicar|Publier/).length).toBeGreaterThan(0);
  });

  it('cannot be approved once it has expired', () => {
    render(<ManyActionCard action={action('pending', { expires_at: new Date(Date.now() - 1000).toISOString() })} many="many-1" busy={false} perform={perform} />);
    expect(screen.getByRole('button', { name: approve })).toBeDisabled();
  });

  it.each(['approved', 'prepared', 'dispatched', 'succeeded', 'failed', 'rejected'])('is a record, with no way to decide again, when %s', (state) => {
    render(<ManyActionCard action={action(state, { receipt: { ok: true } })} many="many-1" busy={false} perform={perform} />);
    expect(screen.queryByRole('button', { name: approve })).toBeNull();
    expect(screen.queryByRole('button', { name: reject })).toBeNull();
    expect(screen.queryByText(/"ok": true/)).toBeNull();
  });

  it('shows the receipt only on request once decided', () => {
    render(<ManyActionCard action={action('succeeded', { receipt: { ok: true } })} many="many-1" busy={false} perform={perform} />);
    fireEvent.click(screen.getByRole('button', { name: /^(Details|Detalles|Détails|Detalhes)$/ }));
    expect(screen.getByText(/"ok": true/)).toBeInTheDocument();
  });

  it('records evidence for an uncertain outcome without offering to resend', async () => {
    render(<ManyActionCard action={action('outcome_unknown')} many="many-1" busy={false} perform={perform} />);
    expect(screen.queryByRole('button', { name: approve })).toBeNull();
    fireEvent.change(screen.getByLabelText(/Evidence|Evidencia|Preuve|Evidência/), { target: { value: 'Checked the inbox' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm failed|Confirmar fallida|Confirmer l'échec|Confirmar falha/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/many-1/actions/act-1', 'PATCH', { outcome: 'failed', evidence: 'Checked the inbox' }));
  });
});
