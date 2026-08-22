import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ListState from './ListState';

describe('ListState', () => {
  it('keeps a recoverable error action visible and operable', async () => {
    const retry = vi.fn();
    render(<ListState variant="error" errorMessage="No se pudo cargar" retryLabel="Reintentar" onRetry={retry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByText('No se pudo cargar')).toBeVisible();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('renders loading label inside a polite live region', () => {
    render(<ListState variant="loading" loadingLabel="Cargando lista" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Cargando lista')).toBeVisible();
  });

  it('renders empty title, description, and action', () => {
    render(
      <ListState
        variant="empty"
        title="Sin elementos"
        description="Aún no hay nada aquí"
        action={<button type="button">Crear</button>}
      />,
    );
    expect(screen.getByText('Sin elementos')).toBeVisible();
    expect(screen.getByText('Aún no hay nada aquí')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Crear' })).toBeVisible();
  });
});
