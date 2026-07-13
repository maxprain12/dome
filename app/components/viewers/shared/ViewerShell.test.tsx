import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ViewerShell from './ViewerShell';

describe('ViewerShell', () => {
  it('composes identity, toolbar, status and specialized content as independent slots', () => {
    render(
      <ViewerShell
        contextLabel="Documents"
        title="Quarterly report"
        toolbar={<button type="button">Export</button>}
        status={<span>Page 2 of 10</span>}
      >
        <canvas aria-label="PDF page" />
      </ViewerShell>,
    );

    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeVisible();
    expect(screen.getByText('Quarterly report')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export' })).toBeVisible();
    expect(screen.getByText('Page 2 of 10')).toBeVisible();
    expect(screen.getByLabelText('PDF page')).toBeVisible();
  });

  it('does not add format-specific chrome when only content is provided', () => {
    render(
      <ViewerShell>
        <div>Specialized editor</div>
      </ViewerShell>,
    );

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByText('Specialized editor')).toBeVisible();
  });
});
