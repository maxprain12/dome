import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/lib/i18n';
import PluginContentView from './PluginContentView';
import type { DomePluginInfo, PluginVaultTemplate } from '@/types/plugin';

vi.mock('@/components/markdown/MarkdownNoteEditor', async () => {
  const { forwardRef, useImperativeHandle, useRef, useState } = await import('react');
  return {
    default: forwardRef(function Editor(
      { initialMarkdown, onChange }: { initialMarkdown: string; onChange?: () => void },
      ref,
    ) {
      const [body, setBody] = useState(initialMarkdown);
      const bodyRef = useRef(initialMarkdown);
      useImperativeHandle(ref, () => ({ getMarkdown: () => bodyRef.current, setMarkdown: (value: string) => { bodyRef.current = value; setBody(value); } }));
      return (
        <textarea
          id="cms-entry-body"
          value={body}
          onChange={(event) => {
            bodyRef.current = event.target.value;
            setBody(event.target.value);
            onChange?.();
          }}
        />
      );
    }),
  };
});

const template: PluginVaultTemplate = {
  id: 'astro-post',
  title: 'Astro content',
  schemaVersion: 1,
  fields: [
    { id: 'collection', type: 'select', label: 'Collection', options: ['blog', 'manual'], required: true },
    { id: 'language', type: 'select', label: 'Language', options: ['es', 'en'], required: true },
    { id: 'date', type: 'date', label: 'Date', required: true },
    { id: 'description', type: 'text', label: 'Description', required: true },
    { id: 'cover', type: 'sitePath', label: 'Cover image' },
    { id: 'tags', type: 'tags', label: 'Tags' },
    { id: 'slug', type: 'slug', label: 'Slug', required: true },
  ],
};

const plugin: DomePluginInfo = {
  id: 'dome-cms',
  name: 'Dome CMS',
  author: 'Dome',
  description: 'Write structured content',
  version: '1.1.0',
  type: 'view',
  dir: '/tmp/dome-cms',
  enabled: true,
  configured: true,
  manifestDigest: 'digest',
  contributes: {
    view: { id: 'content', title: 'Content' },
    vaultTemplate: template,
  },
};

function mockRequest(initial: Array<Record<string, unknown>> = []) {
  const stored: Array<Record<string, unknown>> = [...initial];
  const request = vi.fn(async (_pluginId: string, method: string, params?: unknown) => {
    if (method === 'host.context') {
      return {
        success: true,
        data: {
          apiVersion: 1,
          plugin: { id: 'dome-cms', version: '1.1.0' },
          vault: { id: 'vault-1', name: 'landing-page-dome' },
          template,
          destination: {
            repo: 'maxprain12/landing-page-dome',
            branch: 'main',
            contentPaths: { 'blog/es': 'src/content/blog/es', 'blog/en': 'src/content/blog/en' },
          },
        },
      };
    }
    if (method === 'media.list') return { success: true, data: [] };
    if (method === 'media.delete') return { success: true, data: { deleted: true, remote: false } };
    if (method === 'notes.list') return { success: true, data: stored };
    if (method === 'notes.create') {
      const input = params as { title: string; body: string; fields: Record<string, string | string[]> };
      const note = {
        id: 'note-1',
        title: input.title,
        body: input.body,
        fields: input.fields,
        updatedAt: 1,
        publication: null,
        familyId: null,
        status: 'draft',
      };
      stored.push(note);
      return { success: true, data: note };
    }
    if (method === 'notes.update') {
      const input = params as Record<string, unknown>;
      const index = stored.findIndex((item) => item.id === input.id);
      stored[index] = { ...stored[index], ...input, updatedAt: Number(stored[index].updatedAt) + 1, status: 'changed' };
      return { success: true, data: stored[index] };
    }
    if (method === 'publication.prepareMany') {
      return {
        success: true,
        data: {
          id: 'pub-1',
          repo: 'maxprain12/landing-page-dome',
          branch: 'main',
          files: ['src/content/blog/es/prueba.md', 'src/content/blog/en/test.md'],
        },
      };
    }
    if (method === 'publication.requestApproval') {
      return { success: true, data: { status: 'published', paths: ['src/content/blog/es/prueba.md', 'src/content/blog/en/test.md'] } };
    }
    return { success: false, error: `Unknown method ${method}` };
  });
  Object.assign(window.electron, { plugins: { request } });
  return request;
}

describe('PluginContentView', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es');
  });

  it('fills the slug from the title and creates a note without a sandboxed form', async () => {
    const request = mockRequest();
    const user = userEvent.setup();
    render(<PluginContentView plugin={plugin} />);

    await screen.findByText(i18n.t('plugins.empty_title'));
    await user.click(screen.getAllByRole('button', { name: i18n.t('plugins.new_entry') })[0]);

    const titleInput = await screen.findByLabelText(`${i18n.t('plugins.field_title')} *`);
    await user.type(titleInput, 'Getting Started');
    expect(screen.getByLabelText('Slug *')).toHaveValue('getting-started');
    expect(screen.getByLabelText('Collection *')).toHaveTextContent('Blog');
    expect(screen.getByLabelText('Language *')).toHaveTextContent(/español/i);

    await user.type(screen.getByLabelText('Description *'), 'A quick guide');
    await user.click(screen.getByRole('button', { name: i18n.t('common.create') }));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith('dome-cms', 'notes.create', {
        title: 'Getting Started',
        body: '',
        fields: expect.objectContaining({
          collection: 'blog',
          language: 'es',
          description: 'A quick guide',
          slug: 'getting-started',
        }),
      });
    });
    expect(request).not.toHaveBeenCalledWith('dome-cms', 'notes.open', expect.anything());
    expect(await screen.findByLabelText(i18n.t('plugins.body'))).toBeVisible();
    expect(screen.getByLabelText(i18n.t('plugins.body'))).toHaveValue('');
    expect(screen.getByText('src/content/blog/es/getting-started.md')).toBeVisible();
    expect(screen.getByRole('button', { name: i18n.t('plugins.adapt_languages') })).toBeEnabled();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('publishes the checked entries together', async () => {
    const request = mockRequest([
      {
        id: 'note-es',
        title: 'prueba',
        body: '# prueba',
        fields: { collection: 'blog', language: 'es', slug: 'prueba' },
        updatedAt: 1,
        publication: null,
        familyId: 'family-1',
        status: 'changed',
      },
      {
        id: 'note-en',
        title: 'test',
        body: '# test',
        fields: { collection: 'blog', language: 'en', slug: 'test' },
        updatedAt: 1,
        publication: null,
        familyId: 'family-1',
        status: 'draft',
      },
    ]);
    const user = userEvent.setup();
    render(<PluginContentView plugin={plugin} />);

    await user.click(await screen.findByRole('checkbox', { name: i18n.t('plugins.select_for_publish', { title: 'prueba' }) }));
    await user.click(screen.getByRole('checkbox', { name: i18n.t('plugins.select_for_publish', { title: 'test' }) }));
    await user.click(screen.getByRole('button', { name: i18n.t('plugins.publish_selected', { count: 2 }) }));
    expect(await screen.findByText(i18n.t('plugins.publish_confirm_many', { count: 2 }))).toBeVisible();
    expect(screen.getByText('es/prueba.md')).toBeVisible();
    expect(screen.queryByText('# test')).toBeNull();
    await user.click(screen.getByRole('button', { name: i18n.t('plugins.publish') }));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith('dome-cms', 'publication.prepareMany', {
        resourceIds: ['note-es', 'note-en'],
      });
    });
    expect(request).toHaveBeenCalledWith('dome-cms', 'publication.requestApproval', { id: 'pub-1' });
  });
});

const entries = [
  { id: 'first', title: 'First entry', body: 'First body', fields: { collection: 'blog', language: 'es', slug: 'first' }, updatedAt: 1, status: 'published' },
  { id: 'second', title: 'Second entry', body: 'Second body', fields: { collection: 'blog', language: 'es', slug: 'second' }, updatedAt: 1, status: 'draft' },
];

describe('CMS draft persistence', () => {
  it('saves the current entry before navigating to another entry', async () => {
    const request = mockRequest(entries);
    const user = userEvent.setup();
    render(<PluginContentView plugin={plugin} />);
    await user.click(await screen.findByText('First entry'));
    fireEvent.change(await screen.findByLabelText(i18n.t('plugins.body')), { target: { value: 'Unsaved body' } });
    await user.click(screen.getByText('Second entry'));
    await waitFor(() => expect(screen.getByLabelText(i18n.t('plugins.body'))).toHaveValue('Second body'));
    expect(request).toHaveBeenCalledWith('dome-cms', 'notes.update', expect.objectContaining({ id: 'first', body: 'Unsaved body', expectedUpdatedAt: 1 }));
  });

  it('preserves edits arriving during save and uses the accepted revision on retry', async () => {
    const request = mockRequest(entries);
    const original = request.getMockImplementation()!;
    let complete!: () => void;
    request.mockImplementation(async (id, method, params) => {
      if (method === 'notes.update' && !complete) await new Promise<void>((resolve) => { complete = resolve; });
      return original(id, method, params);
    });
    const user = userEvent.setup();
    render(<PluginContentView plugin={plugin} />);
    await user.click(await screen.findByText('First entry'));
    const body = await screen.findByLabelText(i18n.t('plugins.body'));
    fireEvent.change(body, { target: { value: 'Snapshot' } });
    await user.click(screen.getByRole('button', { name: i18n.t('plugins.save_entry') }));
    await waitFor(() => expect(complete).toBeDefined());
    fireEvent.change(body, { target: { value: 'Latest edit' } });
    await act(async () => { complete(); });
    expect(body).toHaveValue('Latest edit');
    expect(screen.getByRole('button', { name: i18n.t('plugins.save_entry') })).toBeEnabled();
    await user.click(screen.getByText('Second entry'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('dome-cms', 'notes.update', expect.objectContaining({ id: 'first', expectedUpdatedAt: 2, body: 'Latest edit' })));
  });

  it('keeps the current draft visible when saving before navigation fails', async () => {
    const request = mockRequest(entries);
    const original = request.getMockImplementation()!;
    request.mockImplementation(async (id, method, params) => method === 'notes.update'
      ? { success: false, error: 'Disk full' }
      : original(id, method, params));
    const user = userEvent.setup();
    render(<PluginContentView plugin={plugin} />);
    await user.click(await screen.findByText('First entry'));
    fireEvent.change(await screen.findByLabelText(i18n.t('plugins.body')), { target: { value: 'Keep this draft' } });
    await user.click(screen.getByText('Second entry'));
    expect(await screen.findByText('Disk full')).toBeVisible();
    expect(screen.getByLabelText(i18n.t('plugins.body'))).toHaveValue('Keep this draft');
    expect(screen.getByRole('button', { name: i18n.t('plugins.publish') })).toBeEnabled();
  });

  it('filters entries by title without changing the open draft', async () => {
    mockRequest(entries);
    const user = userEvent.setup();
    render(<PluginContentView plugin={plugin} />);
    await user.click(await screen.findByText('First entry'));
    fireEvent.change(await screen.findByLabelText(i18n.t('plugins.body')), { target: { value: 'Keep while searching' } });
    await user.type(screen.getByRole('searchbox'), 'Second');
    expect(screen.queryByText('First entry')).toBeNull();
    expect(screen.getByText('Second entry')).toBeVisible();
    expect(screen.getByLabelText(i18n.t('plugins.body'))).toHaveValue('Keep while searching');
  });
});
