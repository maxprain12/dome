import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarkdownNoteWorkspace from './MarkdownNoteWorkspace';

vi.mock('@/components/markdown/MarkdownNoteEditor', async () => {
  const { forwardRef, useImperativeHandle, useState } = await import('react');
  return { default: forwardRef(function Editor({ initialMarkdown, onChange }: { initialMarkdown: string; onChange: () => void }, ref) {
    const [body, setBody] = useState(initialMarkdown);
    useImperativeHandle(ref, () => ({ getMarkdown: () => body, setMarkdown: setBody }));
    return <textarea aria-label="Body" value={body} onChange={(e) => { setBody(e.target.value); onChange(); }} />;
  }) };
});
vi.mock('@/components/notes/NoteDocTitle', () => ({ default: ({ value, onChange, onBlur }: { value: string; onChange: (s: string) => void; onBlur: () => void }) => <input aria-label="Title" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} /> }));
vi.mock('@/components/workspace/SidePanel', () => ({ default: () => null }));
vi.mock('@/components/workspace/SourcesPanel', () => ({ default: () => null }));
vi.mock('@/components/workspace/StudioPanel', () => ({ default: () => null }));
vi.mock('@/components/workspace/StudioOutputViewer', () => ({ default: () => null }));
vi.mock('@/components/workspace/MetadataModal', () => ({ default: () => null }));
vi.mock('@/components/workspace/SplitResourcePicker', () => ({ default: () => null }));
vi.mock('@/components/notes/NoteActionBar', () => ({ default: () => null }));
vi.mock('@/components/notes/NoteMetaBar', () => ({ default: () => null }));
vi.mock('@/components/notes/NoteEmptyState', () => ({ default: () => null }));
vi.mock('@/components/notes/NoteHeroCover', () => ({ default: () => null }));
vi.mock('@/components/notes/NoteQuickTagModal', () => ({ default: () => null }));
vi.mock('@/lib/notes/loadNoteMarkdown', () => ({ loadNoteMarkdown: async () => 'Original', countWordsFromMarkdown: () => 1 }));

const writeMirror = vi.fn();
const update = vi.fn();
let broadcast: (payload: unknown) => void;

beforeEach(() => {
  writeMirror.mockResolvedValue({ success: true });
  update.mockResolvedValue({ success: true });
  vi.stubGlobal('electron', undefined);
  Object.defineProperty(window, 'electron', { configurable: true, value: {
    on: (_event: string, listener: typeof broadcast) => { broadcast = listener; return () => {}; },
    notes: { writeMirror },
    db: {
      resources: { getById: async () => ({ success: true, data: { id: 'note', type: 'note', title: 'Title', project_id: 'default', content: 'Original', vault_path: 'Title.md', updated_at: 1 } }), update },
      projects: { getById: async () => ({ success: true, data: { name: 'Library' } }) },
    },
  } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function openNote() {
  render(<MarkdownNoteWorkspace resourceId="note" compact />);
  await screen.findByLabelText('Body');
}
function save() { fireEvent.keyDown(window, { key: 's', ctrlKey: true }); }

describe('note persistence', () => {
  it('reports a rejected mirror write and retries the unsaved body', async () => {
    await openNote();
    writeMirror.mockResolvedValueOnce({ success: false, error: 'Disk full' });
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Unsaved' } });
    save();
    expect(await screen.findByRole('alert')).toHaveTextContent('Disk full');
    expect(update).toHaveBeenCalledOnce();
    save();
    await waitFor(() => expect(writeMirror).toHaveBeenCalledTimes(2));
    expect(writeMirror).toHaveBeenLastCalledWith({ id: 'note', markdown: 'Unsaved' });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('uses the same checked save flow on title blur', async () => {
    await openNote();
    update.mockResolvedValueOnce({ success: false, error: 'Database unavailable' });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New title' } });
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'New body' } });
    fireEvent.blur(screen.getByLabelText('Title'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
    expect(writeMirror).not.toHaveBeenCalled();
    save();
    await waitFor(() => expect(writeMirror).toHaveBeenCalledWith({ id: 'note', markdown: 'New body' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ title: 'New title' }));
    expect(update.mock.invocationCallOrder[1]).toBeLessThan(writeMirror.mock.invocationCallOrder[0]);
  });

  it('serializes saves and preserves edits arriving while a save is pending', async () => {
    await openNote();
    let resolveWrite!: (value: { success: boolean }) => void;
    writeMirror.mockImplementationOnce(() => new Promise((resolve) => { resolveWrite = resolve; }));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'First body' } });
    save();
    await waitFor(() => expect(writeMirror).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Latest title' } });
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Latest body' } });
    save();
    fireEvent.blur(screen.getByLabelText('Title'));
    expect(writeMirror).toHaveBeenCalledOnce();
    act(() => broadcast({ id: 'note', updates: { title: 'Title' } }));
    expect(screen.getByLabelText('Title')).toHaveValue('Latest title');
    await act(async () => resolveWrite({ success: true }));
    save();
    await waitFor(() => expect(writeMirror).toHaveBeenCalledTimes(2));
    expect(writeMirror).toHaveBeenLastCalledWith({ id: 'note', markdown: 'Latest body' });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Latest title' }));
  });
});
