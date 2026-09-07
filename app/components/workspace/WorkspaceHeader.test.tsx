import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import WorkspaceHeader from './WorkspaceHeader';

vi.mock('@/components/viewers/shared/IndexStatusBadge', () => ({ default: () => null }));
vi.mock('@/components/workspace/SplitResourcePicker', () => ({ default: () => null }));
vi.mock('@/lib/many/openManyCombined', () => ({ openManyWithCombinedContext: vi.fn() }));

const resource = {
  id: 'doc', project_id: 'default', type: 'document' as const,
  title: 'Report', vault_path: 'Report.docx', created_at: 1, updated_at: 1,
};

describe('workspace action menu', () => {
  it('opens from its button, supports keyboard activation and restores focus', async () => {
    const user = userEvent.setup();
    const showMetadata = vi.fn();
    render(<WorkspaceHeader resource={resource} sidePanelOpen={false} onToggleSidePanel={vi.fn()} onShowMetadata={showMetadata} />);
    const trigger = screen.getByRole('button', { name: i18n.t('workspace.more_options') });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    const item = await screen.findByRole('menuitem', { name: i18n.t('viewer.resource_info') });
    await waitFor(() => expect(item).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(showMetadata).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('only offers filesystem actions when the resource has a vault file', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WorkspaceHeader resource={resource} sidePanelOpen={false} onToggleSidePanel={vi.fn()} onShowMetadata={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: i18n.t('workspace.more_options') }));
    expect(await screen.findByRole('menuitem', { name: i18n.t('viewer.open_with_default_app') })).toBeVisible();
    rerender(<WorkspaceHeader resource={{ ...resource, vault_path: undefined }} sidePanelOpen={false} onToggleSidePanel={vi.fn()} onShowMetadata={vi.fn()} />);
    expect(screen.queryByRole('menuitem', { name: i18n.t('viewer.open_with_default_app') })).not.toBeInTheDocument();
  });
});
