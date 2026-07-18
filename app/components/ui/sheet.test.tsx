import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from './sheet';

describe('Sheet', () => {
  it('opens contextual detail with an accessible title', async () => {
    render(<Sheet><SheetTrigger render={<Button />}>Abrir detalles</SheetTrigger><SheetContent><SheetTitle>Detalles</SheetTitle><SheetDescription>Contexto de la selección.</SheetDescription></SheetContent></Sheet>);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir detalles' }));
    expect(await screen.findByRole('dialog', { name: 'Detalles' })).toBeVisible();
  });
});
