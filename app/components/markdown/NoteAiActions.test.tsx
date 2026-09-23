import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditorContent } from '@tiptap/react';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chat } from '@/lib/ai/client';
import i18n from '@/lib/i18n';
import { noteExtensions } from './note-extensions';
import NoteAiActions from './NoteAiActions';

vi.mock('@/lib/ai/client', () => ({ chat: vi.fn() }));

const editors: Editor[] = [];
afterEach(() => { editors.splice(0).forEach((editor) => editor.destroy()); vi.clearAllMocks(); });

function setup() {
  const editor = new Editor({ extensions: noteExtensions(), content: 'Hello world', contentType: 'markdown' });
  editors.push(editor);
  render(<><EditorContent editor={editor} /><NoteAiActions editor={editor} /></>);
  act(() => editor.commands.setTextSelection({ from: 1, to: 6 }));
  return editor;
}

async function chooseImprove() {
  fireEvent.click(screen.getByRole('button', { name: i18n.t('notes.editor_ai') }));
  fireEvent.click(await screen.findByRole('menuitem', { name: i18n.t('notes.editor_ai_improve') }));
}

describe('note AI actions', () => {
  it('previews a suggestion and replaces only the selected text after approval', async () => {
    vi.mocked(chat).mockResolvedValue('Clear');
    const editor = setup();
    await chooseImprove();
    expect(await screen.findByRole('textbox', { name: i18n.t('notes.editor_ai_result') })).toHaveValue('Clear');
    expect(editor.getMarkdown()).toContain('Hello world');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('notes.editor_ai_apply') }));
    expect(editor.getMarkdown()).toContain('Clear world');
  });

  it('refuses to apply a stale suggestion after the note changes', async () => {
    vi.mocked(chat).mockResolvedValue('Clear');
    const editor = setup();
    await chooseImprove();
    await screen.findByRole('textbox', { name: i18n.t('notes.editor_ai_result') });
    act(() => editor.commands.insertContentAt(editor.state.doc.content.size, ' later'));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('notes.editor_ai_apply') }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('notes.editor_ai_changed')));
    expect(editor.getMarkdown()).toContain('Hello world');
  });

  it('sends an explicit target language for translation', async () => {
    vi.mocked(chat).mockResolvedValue('Hola');
    setup();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('notes.editor_ai') }));
    fireEvent.click(await screen.findByRole('menuitem', { name: i18n.t('notes.editor_ai_translate_es') }));
    await waitFor(() => expect(chat).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: expect.stringContaining('Target language: Spanish') }),
    ])));
  });
});
