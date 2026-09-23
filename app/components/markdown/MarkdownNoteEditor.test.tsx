import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import MarkdownNoteEditor, { type MarkdownNoteEditorHandle } from './MarkdownNoteEditor';
import { needsSourceEditor, noteExtensions } from './note-extensions';
import i18n from '@/lib/i18n';
import { requestPlugin } from '@/lib/plugins/request';

vi.mock('@/lib/plugins/request', () => ({ requestPlugin: vi.fn().mockResolvedValue({}) }));

vi.mock('@/lib/plugins/media', async (original) => ({
  ...await original<typeof import('@/lib/plugins/media')>(),
  attachPluginImage: vi.fn().mockRejectedValue(new Error('Disk full')),
}));

describe('shared Tiptap Markdown editor', () => {
  it('round trips headings, formatting, tasks, code, tables and media references', () => {
    const source = '# Heading\n\n**Bold** and *italic* and [link](https://example.com)\n\n- [x] Done\n- [ ] Next\n\n```ts\nconst answer = 42;\n```\n\n| Name | Value |\n| --- | --- |\n| Item | 42 |\n\n![Cover](dome-media:123e4567-e89b-42d3-a456-426614174000)';
    const editor = new Editor({ extensions: noteExtensions(), content: source, contentType: 'markdown' });
    const document = editor.getJSON();
    const serialized = editor.getMarkdown();
    editor.commands.setContent(serialized, { contentType: 'markdown' });
    expect(editor.getMarkdown().trim()).toBe(serialized.trim());
    expect(editor.getJSON().content).toEqual(expect.arrayContaining(document.content!));
    expect(serialized).toContain('- [x] Done');
    expect(serialized).toContain('dome-media:123e4567-e89b-42d3-a456-426614174000');
    expect(serialized).toContain('const answer = 42;');
    editor.destroy();
  });

  it('preserves original bytes and loads stored revisions without firing onChange', async () => {
    const ref = createRef<MarkdownNoteEditorHandle>();
    const onChange = vi.fn();
    const original = '# Title\n\n\nText  \nnext\n';
    render(<MarkdownNoteEditor ref={ref} initialMarkdown={original} onChange={onChange} />);
    await screen.findByRole('textbox');
    expect(ref.current?.getMarkdown()).toBe(original);
    act(() => ref.current?.setMarkdown('## External revision\n\n'));
    expect(ref.current?.getMarkdown()).toBe('## External revision\n\n');
    expect(screen.getByRole('heading', { name: 'External revision' })).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('preserves advanced documents and allows editing their source verbatim', () => {
    const ref = createRef<MarkdownNoteEditorHandle>();
    const onChange = vi.fn();
    const source = 'import Widget from "./Widget.astro"\n\n<Widget title="Hello" />\n\n$$x^2$$\n';
    render(<MarkdownNoteEditor ref={ref} initialMarkdown={source} onChange={onChange} />);
    expect(screen.getByRole('textbox')).toHaveValue(source);
    expect(screen.getByRole('button', { name: i18n.t('notes.editor_visual') })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: source + '\nMore' } });
    expect(ref.current?.getMarkdown()).toBe(source + '\nMore');
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('does not offer formatting or uploads in read-only mode', () => {
    render(<MarkdownNoteEditor initialMarkdown="# Published" readOnly />);
    expect(screen.getByRole('textbox')).toHaveAttribute('contenteditable', 'false');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('reports failed media persistence without inserting a temporary blob URL', async () => {
    const ref = createRef<MarkdownNoteEditorHandle>();
    render(<MarkdownNoteEditor ref={ref} initialMarkdown="Original" pluginId="dome-cms" resourceId="note" />);
    fireEvent.change(screen.getByLabelText(i18n.t('notes.slash_item_image')), {
      target: { files: [new File(['image'], 'cover.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    expect(ref.current?.getMarkdown()).toBe('Original');
  });

  it('resolves landing images after the vault note plugin context arrives without changing Markdown', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const dataUrl = 'data:image/png;base64,aW1hZ2U=';
    vi.mocked(requestPlugin).mockResolvedValueOnce([{ id, name: 'cover.png', sitePath: '/media/cover.png' }]);
    vi.mocked(requestPlugin).mockResolvedValueOnce({ destination: { siteUrl: 'https://example.com' } });
    Object.assign(window.electron, { resource: { readFile: vi.fn().mockResolvedValue({ success: true, data: dataUrl }) } });
    const ref = createRef<MarkdownNoteEditorHandle>();
    const onChange = vi.fn();
    const markdown = '![Cover](/media/cover.png)';
    const view = render(<MarkdownNoteEditor ref={ref} initialMarkdown={markdown} onChange={onChange} />);
    view.rerender(<MarkdownNoteEditor ref={ref} initialMarkdown={markdown} pluginId="cms" onChange={onChange} />);
    await waitFor(() => expect(screen.getByRole('img', { name: 'Cover' })).toHaveAttribute('src', dataUrl));
    expect(ref.current?.getMarkdown()).toBe(markdown);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps code fences visual and protects legacy blocks, HTML and footnotes', () => {
    expect(needsSourceEditor('```html\n<div>Example</div>\n```')).toBe(false);
    for (const source of [':::callout\nKeep me\n:::', '[^1]: Footnote', '<br>', '$x^2$', '---\ntitle: Hello\n---']) {
      expect(needsSourceEditor(source)).toBe(true);
    }
  });
});
