import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from './empty';

describe('Empty', () => {
  it('announces the empty-state heading and explanation', () => {
    render(<Empty><EmptyHeader><EmptyTitle>Sin resultados</EmptyTitle><EmptyDescription>Prueba otra búsqueda</EmptyDescription></EmptyHeader></Empty>);
    expect(screen.getByText('Sin resultados')).toBeVisible();
    expect(screen.getByText('Prueba otra búsqueda')).toBeVisible();
  });
});
