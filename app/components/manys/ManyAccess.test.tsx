import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManyConnections, { serverHost } from './ManyConnections';
import ManySkills, { skillSlug } from './ManySkills';
import { request, type McpServer, type Skill } from '@/lib/manys/api';

vi.mock('@/lib/manys/api', () => ({ request: vi.fn() }));

const skill: Skill = { id: 'skill-1', many_id: 'many-test', name: 'weekly-report', description: 'How to write it', content: 'Three sections.', enabled: true };
const server: McpServer = {
  id: 'srv-1', many_id: 'many-test', name: 'crm', url: 'https://mcp.example.com/rpc', credential_id: null, enabled: true,
  tools: [{ name: 'search', description: '', readOnly: true }, { name: 'create_issue', description: '', readOnly: false }], tools_refreshed_at: '2026-10-05T10:00:00Z',
};

beforeEach(() => {
  vi.mocked(request).mockImplementation(async (path: string, method?: string) => {
    if (method && method !== 'GET') return (path.endsWith('/mcp') ? { ...server, id: 'srv-new', name: 'notes' } : {}) as never;
    if (path.endsWith('/skills')) return { skills: [skill] } as never;
    if (path.endsWith('/mcp')) return { servers: [server] } as never;
    return { credentials: [] } as never;
  });
});

describe('helpers', () => {
  it('turns a title into the name the provider accepts', () => {
    expect(skillSlug('Weekly Report!')).toBe('weekly-report');
    expect(skillSlug('  --A  b--  ')).toBe('a-b');
    expect(skillSlug('***')).toBe('');
  });
  it('shows only the host of a server address', () => {
    expect(serverHost('https://mcp.example.com/rpc?token=x')).toBe('mcp.example.com');
  });
});

describe('ManySkills', () => {
  it('lists skills and creates one under a valid name', async () => {
    render(<ManySkills manyId="many-test" />);
    expect(await screen.findByText('weekly-report')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^(Name|Nombre|Nom|Nome)$/), { target: { value: 'Client Notes' } });
    fireEvent.change(screen.getByLabelText(/^(Instructions|Instrucciones|Instruções)$/), { target: { value: 'Keep it short.' } });
    fireEvent.click(screen.getByRole('button', { name: /^(Create skill|Crear skill|Créer la skill|Criar skill)$/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/many-test/skills', 'POST', { name: 'client-notes', description: '', content: 'Keep it short.', scope: 'many' }));
  });

  it('switches a skill off without deleting it', async () => {
    render(<ManySkills manyId="many-test" />);
    fireEvent.click(await screen.findByRole('switch', { name: /weekly-report/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/many-test/skills/skill-1', 'PATCH', { enabled: false }));
  });
});

describe('ManyConnections', () => {
  it('shows how many tools a service has and how many only read', async () => {
    render(<ManyConnections manyId="many-test" />);
    expect(await screen.findByText('crm')).toBeInTheDocument();
    expect(screen.getByText(/2 tools, 1 read-only|2 herramientas, 1 de solo lectura|2 outils, 1 en lecture seule|2 ferramentas, 1 só de leitura/)).toBeInTheDocument();
  });

  it('saves the service first and then reads its tools', async () => {
    render(<ManyConnections manyId="many-test" />);
    fireEvent.change(await screen.findByLabelText(/^(Name|Nombre|Nom|Nome)$/), { target: { value: 'notes' } });
    fireEvent.change(screen.getByLabelText(/^(Server address|Dirección del servidor|Adresse du serveur|Endereço do servidor)$/), { target: { value: 'https://notes.example.com/mcp' } });
    fireEvent.click(screen.getByRole('button', { name: /^(Connect|Conectar|Connecter|Ligar)$/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/many-test/mcp', 'POST', { scope: 'many', name: 'notes', url: 'https://notes.example.com/mcp' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/many-test/mcp/srv-new/refresh', 'POST', {}));
  });
});
