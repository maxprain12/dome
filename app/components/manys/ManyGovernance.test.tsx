import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManyGovernance from './ManyGovernance';
import { request, type AuditEntry, type Policy } from '@/lib/manys/api';

vi.mock('@/lib/manys/api', () => ({ request: vi.fn() }));

const rule: Policy = { id: 'rule-1', many_id: 'many-test', name: 'No bank', effect: 'deny', mode: 'enforce', enabled: true, match: { hosts: ['*.bank.com'] } };
const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  id: 'd1', sequence: 2, phase: 'decision', parent_id: null, tool: 'computer_act', operation: 'navigate', host: 'www.bank.com',
  decision: 'denied', rule_name: 'No bank', reason: 'policy_denied', outcome: null, error_code: null, created_at: '2026-10-05T10:00:00Z', ...over,
});

beforeEach(() => {
  vi.mocked(request).mockImplementation(async (path: string) => (path.endsWith('/audit') ? { entries: [entry({})] } : { policies: [rule] }) as never);
});

describe('ManyGovernance', () => {
  it('shows the rules and the record of what was blocked', async () => {
    render(<ManyGovernance manyId="many-test" />);
    expect(await screen.findByText('No bank', { selector: 'span.font-medium' })).toBeInTheDocument();
    expect(await screen.findByText(/computer_act · navigate/)).toBeInTheDocument();
    expect(screen.getAllByText(/Blocked|Bloqueada|Bloqué|Bloqueada/).length).toBeGreaterThan(0);
  });

  it('creates a block rule from the websites field and sends only the filled fields', async () => {
    render(<ManyGovernance manyId="many-test" />);
    fireEvent.change(await screen.findByLabelText(/^(Name|Nombre|Nom)$/), { target: { value: 'No mail' } });
    fireEvent.change(screen.getByLabelText(/^(Websites|Sitios web|Sites web|Sites)$/), { target: { value: 'mail.example.com, *.corp.test' } });
    fireEvent.click(screen.getByRole('button', { name: /^(Create rule|Crear regla|Créer la règle|Criar regra)$/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/many-test/policies', 'POST', {
      scope: 'many', name: 'No mail', effect: 'deny', mode: 'enforce', match: { hosts: ['mail.example.com', '*.corp.test'] },
    }));
  });

  it('turns a rule off without deleting it', async () => {
    render(<ManyGovernance manyId="many-test" />);
    fireEvent.click(await screen.findByRole('switch', { name: /No bank/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/many-test/policies/rule-1', 'PATCH', { enabled: false }));
  });
});
