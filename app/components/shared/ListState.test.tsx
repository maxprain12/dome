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
});
