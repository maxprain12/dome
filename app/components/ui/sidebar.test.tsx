import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Sidebar, SidebarContent, SidebarProvider, SidebarTrigger } from './sidebar';

describe('Sidebar', () => {
  it('supports the shell keyboard shortcut through the provider', async () => {
    render(<SidebarProvider><Sidebar><SidebarContent>Navegación</SidebarContent></Sidebar><SidebarTrigger /></SidebarProvider>);
    const trigger = screen.getByRole('button', { name: /toggle sidebar/i });
    expect(trigger).toBeVisible();
    await userEvent.keyboard('{Meta>}b{/Meta}');
    expect(document.cookie).toContain('sidebar_state=false');
  });
});
