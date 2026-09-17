import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResourceQuickLook from './ResourceQuickLook';
import type { Resource } from '@/lib/hooks/useResources';

function res(id: string, title: string): Resource {
  return {
    id,
    title,
    type: 'note',
    project_id: 'p1',
    folder_id: null,
    created_at: 0,
    updated_at: 0,
  };
}

describe('ResourceQuickLook', () => {
  it('navigates with next/prev and opens the current resource', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onOpenResource = vi.fn();
    const onOpenChange = vi.fn();
    const items = [res('a', 'Alpha'), res('b', 'Beta'), res('c', 'Gamma')];

    render(
      <ResourceQuickLook
        open
        resource={items[1]}
        resources={items}
        onOpenChange={onOpenChange}
        onNavigate={onNavigate}
        onOpenResource={onOpenResource}
      />,
    );

    expect(screen.getByText('Beta')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /previous|anterior|prev/i }));
    expect(onNavigate).toHaveBeenCalledWith(items[0]);
    await user.click(screen.getByRole('button', { name: /next|siguiente/i }));
    expect(onNavigate).toHaveBeenCalledWith(items[2]);
    await user.click(screen.getByRole('button', { name: /open|abrir/i }));
    expect(onOpenResource).toHaveBeenCalledWith(items[1]);
  });
});
