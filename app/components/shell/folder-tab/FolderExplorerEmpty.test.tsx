import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FolderExplorerEmpty, FolderExplorerError } from './FolderExplorerEmpty';

describe('FolderExplorerEmpty', () => {
  it('renders import, folder and note actions', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    const onNewFolder = vi.fn();
    const onNewNote = vi.fn();
    render(
      <FolderExplorerEmpty
        onImport={onImport}
        onNewFolder={onNewFolder}
        onNewNote={onNewNote}
      />,
    );
    await user.click(screen.getByRole('button', { name: /import/i }));
    await user.click(screen.getByRole('button', { name: /folder|carpeta/i }));
    await user.click(screen.getByRole('button', { name: /note|nota/i }));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onNewFolder).toHaveBeenCalledTimes(1);
    expect(onNewNote).toHaveBeenCalledTimes(1);
  });
});

describe('FolderExplorerError', () => {
  it('exposes a retry action', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<FolderExplorerError message="boom" onRetry={onRetry} />);
    expect(screen.getByText('boom')).toBeTruthy();
    await user.click(screen.getByRole('button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
