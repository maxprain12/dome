import { createRef } from 'react';

document.elementFromPoint = () => null;
const emptyRect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0, toJSON: () => ({}) } as DOMRect;
Range.prototype.getBoundingClientRect = () => emptyRect;
const emptyRects = (() => []) as unknown as () => DOMRectList;
Range.prototype.getClientRects = emptyRects;
Object.assign(Text.prototype, { getClientRects: emptyRects });
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import MarkdownNoteEditor, { type MarkdownNoteEditorHandle } from './MarkdownNoteEditor';
import { needsSourceEditor, noteExtensions, type NoteEditorProfile } from './extensions';
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
    const serialized = editor.getMarkdown();
    editor.commands.setContent(serialized, { contentType: 'markdown' });
    expect(editor.getMarkdown().trim()).toBe(serialized.trim());
    expect(serialized).toContain('- [x] Done');
    expect(serialized).toContain('dome-media:123e4567-e89b-42d3-a456-426614174000');
    expect(serialized).toContain('const answer = 42;');
    editor.destroy();
  });

  it('round trips Dome syntax and leaves wikilinks literal in the CMS profile', () => {
    const samples: Array<[string, string]> = [
      ['==highlighted==', '==highlighted=='],
      ['[[Research note|alias]]', '[[Research note|alias]]'],
      ['> [!warning] Watch out\n> Keep the source', '> [!warning] Watch out'],
      ['$x^2$', '$x^2$'],
      ['$$x^2$$', '$$x^2$$'],
      ['<details>\n<summary>More</summary>\n\nHidden\n</details>', '<summary>More</summary>'],
      ['![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
      ['```ts\nconst answer = 42;\n```', '```ts'],
    ];
    for (const [source, marker] of samples) {
      const editor = new Editor({ extensions: noteExtensions(), content: source, contentType: 'markdown' });
      const serialized = editor.getMarkdown().trim();
      editor.commands.setContent(serialized, { contentType: 'markdown' });
      expect(editor.getMarkdown().trim(), source).toBe(serialized);
      expect(serialized, source).toContain(marker);
      editor.destroy();
    }
    const cms = new Editor({ extensions: noteExtensions('cms' satisfies NoteEditorProfile), content: '[[Keep me]]', contentType: 'markdown' });
    expect(cms.getMarkdown()).toContain('[[Keep me]]');
    expect(cms.getText()).toContain('[[Keep me]]');
    cms.destroy();
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
    act(() => ref.current?.setSourceMode(false));
    expect(screen.getByRole('textbox')).toHaveValue(source);
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

  it('keeps code fences, math, callouts and details visual and protects legacy blocks', () => {
    expect(needsSourceEditor('```html\n<div>Example</div>\n```')).toBe(false);
    for (const source of ['$x^2$', '$$\nx^2\n$$', '==hl==', '> [!warning] Title\n> Body', '<details><summary>More</summary>\n\nBody\n</details>']) {
      expect(needsSourceEditor(source)).toBe(false);
    }
    for (const source of [':::callout\nKeep me\n:::', '[^1]: Footnote', '<br>', '---\ntitle: Hello\n---']) {
      expect(needsSourceEditor(source)).toBe(true);
    }
  });

  it('keeps the slash menu open and filters it while typing', async () => {
    const user = userEvent.setup();
    render(<MarkdownNoteEditor initialMarkdown={'# One\n\n## Two\n\n### Three\n\n'} />);
    const box = await screen.findByRole('textbox');
    await user.click(box);
    await user.keyboard('/');
    expect(await screen.findByRole('option', { name: i18n.t('notes.slash_item_text') })).toBeVisible();
    await user.keyboard('tab');
    expect(await screen.findByRole('option', { name: i18n.t('notes.slash_item_table') })).toBeVisible();
    expect(screen.queryByRole('option', { name: i18n.t('notes.slash_item_quote') })).toBeNull();
  });

  it('shows the selection menu and completes a wikilink from search', async () => {
    const user = userEvent.setup();
    Object.assign(window.electron, {
      db: { resources: { search: vi.fn().mockResolvedValue({ success: true, data: [{ id: 'res-1', title: 'Research note', type: 'note' }] }) } },
    });
    render(<MarkdownNoteEditor initialMarkdown="Hello world" />);
    const box = await screen.findByRole('textbox');
    await user.click(box);
    await user.keyboard('{Control>}a{/Control}');
    expect(await screen.findByRole('button', { name: i18n.t('notes.editor_bold'), hidden: true })).toBeInTheDocument();
    await user.keyboard('{[}{[}Res');
    expect(await screen.findByRole('option', { name: 'Research note' })).toBeVisible();
  });
});
