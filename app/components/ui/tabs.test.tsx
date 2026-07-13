import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

describe('Tabs', () => {
  it('switches the active panel from the keyboard-accessible trigger', async () => {
    render(<Tabs defaultValue="details"><TabsList><TabsTrigger value="details">Detalles</TabsTrigger><TabsTrigger value="sources">Fuentes</TabsTrigger></TabsList><TabsContent value="details">Metadatos</TabsContent><TabsContent value="sources">Referencias</TabsContent></Tabs>);
    await userEvent.click(screen.getByRole('tab', { name: 'Fuentes' }));
    expect(screen.getByText('Referencias')).toBeVisible();
  });
});
