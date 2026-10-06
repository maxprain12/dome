import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManyMemory from './ManyMemory';
import { request } from '@/lib/manys/api';

vi.mock('@/lib/manys/api', () => ({ request: vi.fn() }));
const grants = { projects: [], resources: [], capabilities: ['vault.read'] };

beforeEach(() => {
  vi.mocked(request).mockReset().mockImplementation(async (path: string, method?: string, body?: Record<string, unknown>) => {
    if (method === 'PUT') return { notes: String(body?.notes) } as never;
    if (method === 'DELETE') return { notes: '' } as never;
    return { notes: 'Prefers short answers' } as never;
  });
});

describe('what a Many remembers', () => {
  it('shows it, lets the owner correct it and clear it', async () => {
    render(<ManyMemory manyId="m1" grants={grants} busy={false} onGrants={vi.fn()} />);
    const field = await screen.findByDisplayValue('Prefers short answers');
    await userEvent.clear(field);
    await userEvent.type(field, 'Works in Madrid');
    await userEvent.click(screen.getByRole('button', { name: /^(Guardar|Save|Enregistrer)$/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/m1/memory', 'PUT', { notes: 'Works in Madrid' }));
    await userEvent.click(screen.getByRole('button', { name: /^(Borrar|Clear|Effacer)$/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/m1/memory', 'DELETE'));
  });

  it('switches memory off through the grants and hides the notes', async () => {
    const onGrants = vi.fn();
    const view = render(<ManyMemory manyId="m1" grants={grants} busy={false} onGrants={onGrants} />);
    await userEvent.click(await screen.findByRole('switch'));
    expect(onGrants).toHaveBeenCalledWith({ ...grants, memory: false });
    view.rerender(<ManyMemory manyId="m1" grants={{ ...grants, memory: false }} busy={false} onGrants={onGrants} />);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
