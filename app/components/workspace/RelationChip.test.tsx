import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import RelationChip from './RelationChip';

describe('RelationChip', () => {
  it('renders tag title with hash prefix and type hint only for non-tags', () => {
    const { rerender } = render(
      <RelationChip variant="tag" title="research" resourceType="pdf" />,
    );
    expect(screen.getByText('#research')).toBeVisible();
    expect(screen.queryByText('PDF')).toBeNull();

    rerender(<RelationChip variant="mention" title="Paper" resourceType="pdf" />);
    expect(screen.getByText('Paper')).toBeVisible();
    expect(screen.getByText('PDF')).toBeVisible();
  });

  it('prefers subtitle over resource type label', () => {
    render(
      <RelationChip
        variant="url"
        title="Example"
        subtitle="Custom hint"
        resourceType="pdf"
      />,
    );
    expect(screen.getByText('Custom hint')).toBeVisible();
    expect(screen.queryByText('PDF')).toBeNull();
  });

  it('shows similarity percent and relation state badges', () => {
    const { rerender } = render(
      <RelationChip
        variant="mention"
        title="A"
        similarity={0.42}
        relationState="auto"
      />,
    );
    expect(screen.getByText('42%')).toBeVisible();
    expect(screen.getByText('auto')).toBeVisible();

    rerender(
      <RelationChip
        variant="mention"
        title="A"
        similarity={0.995}
        relationState="confirmed"
      />,
    );
    expect(screen.getByText('100%')).toBeVisible();
    expect(screen.getByText('OK')).toBeVisible();

    rerender(
      <RelationChip variant="mention" title="A" relationState="manual" />,
    );
    expect(screen.queryByText('manual')).toBeNull();

    rerender(
      <RelationChip variant="mention" title="A" relationState="rejected" />,
    );
    expect(screen.getByText('rejected')).toBeVisible();
  });

  it('invokes onOpen and onRemove when provided', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onRemove = vi.fn();
    render(
      <RelationChip
        variant="mention"
        title="Open me"
        onOpen={onOpen}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open me' }));
    expect(onOpen).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner when remove is disabled', () => {
    render(
      <RelationChip
        variant="mention"
        title="Busy"
        onRemove={vi.fn()}
        removeDisabled
      />,
    );
    const remove = screen.getByRole('button', { name: 'Remove' });
    expect(remove).toBeDisabled();
    expect(remove.querySelector('.animate-spin')).toBeTruthy();
  });
});
