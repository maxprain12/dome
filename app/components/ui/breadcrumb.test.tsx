import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from './breadcrumb';

describe('Breadcrumb', () => {
  it('identifies the current workspace location', () => {
    render(<Breadcrumb><BreadcrumbList><BreadcrumbItem>Proyecto</BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>Documento</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>);
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeVisible();
    expect(screen.getByText('Documento')).toHaveAttribute('aria-current', 'page');
  });
});
