import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';

describe('Card', () => {
  it('keeps title, description and content in the documented composition', () => {
    render(<Card><CardHeader><CardTitle>Proyecto</CardTitle><CardDescription>Última actividad</CardDescription></CardHeader><CardContent>Documento</CardContent></Card>);
    expect(screen.getByText('Proyecto')).toBeVisible();
    expect(screen.getByText('Última actividad')).toBeVisible();
    expect(screen.getByText('Documento')).toBeVisible();
  });
});
