import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HubSectionShell } from './HubSectionShell';

describe('HubSectionShell', () => {
  it('renders toolbar controls without a page title', () => {
    render(
      <HubSectionShell toolbar={<button type="button">Nuevo contacto</button>}>
        <p>Listado</p>
      </HubSectionShell>,
    );
    expect(screen.getByRole('button', { name: 'Nuevo contacto' })).toBeVisible();
    expect(screen.getByText('Listado')).toBeVisible();
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
