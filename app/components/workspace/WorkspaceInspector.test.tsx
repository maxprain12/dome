import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceInspector from './WorkspaceInspector';
import type { Resource } from '@/types';

const resource = {
  id: 'resource-1',
  project_id: 'project-1',
  type: 'pdf',
  title: 'Research paper',
  original_filename: 'paper.pdf',
  file_mime_type: 'application/pdf',
  created_at: 1,
  updated_at: 2,
} as Resource;

describe('WorkspaceInspector', () => {
  it('uses one tabbed surface and exposes metadata editing', async () => {
    const user = userEvent.setup();
    const onEditMetadata = vi.fn();

    render(
      <WorkspaceInspector
        resource={resource}
        activeTab="details"
        onActiveTabChange={vi.fn()}
        onClose={vi.fn()}
        onEditMetadata={onEditMetadata}
      />,
    );

    expect(screen.getByRole('complementary', { name: /inspector/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /inspector/i })).toHaveFocus();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByText('paper.pdf')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /editar metadatos/i }));
    expect(onEditMetadata).toHaveBeenCalledOnce();
  });
});
