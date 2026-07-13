import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog';
import { Button } from './button';

describe('Dialog', () => {
  it('opens a titled focal task and closes with Escape', async () => {
    render(<Dialog><DialogTrigger render={<Button />}>Crear proyecto</DialogTrigger><DialogContent><DialogTitle>Nuevo proyecto</DialogTitle><DialogDescription>Configura el proyecto.</DialogDescription></DialogContent></Dialog>);
    await userEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));
    expect(await screen.findByRole('dialog', { name: 'Nuevo proyecto' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Nuevo proyecto' })).not.toBeInTheDocument();
    });
  });
});
