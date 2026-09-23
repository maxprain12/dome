import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/lib/i18n';
import PluginEntryEditor from './PluginEntryEditor';
import type { PluginNote, PluginVaultTemplate } from '@/types/plugin';

vi.mock('@/lib/ai/client', () => ({
  chat: vi.fn(),
}));

vi.mock('@/components/people/peopleContactActions', () => ({
  openExternalHref: vi.fn(),
}));

vi.mock('@/components/markdown/MarkdownNoteEditor', async () => {
  const { forwardRef, useImperativeHandle, useState } = await import('react');
  return {
    default: forwardRef(function Editor(
      { initialMarkdown }: { initialMarkdown: string },
      ref,
    ) {
      const [body, setBody] = useState(initialMarkdown);
      useImperativeHandle(ref, () => ({ getMarkdown: () => body, setMarkdown: setBody }));
      return <textarea id="cms-entry-body" value={body} readOnly />;
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
    { id: 'slug', type: 'slug', label: 'Slug', required: true },
  ],
};

const note: PluginNote = {
  id: 'note-1',
  title: 'Prueba',
  body: '# Prueba',
  fields: { collection: 'blog', language: 'es', slug: 'prueba' },
  updatedAt: 1,
  publication: { path: 'src/content/blog/es/prueba.md', contentDigest: 'abc' },
  familyId: 'family-1',
  status: 'published',
};

describe('PluginEntryEditor toolbar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es');
    Object.assign(window.electron, {
      plugins: {
        request: vi.fn(async (_pluginId: string, method: string) => {
          if (method === 'media.list') return { success: true, data: [] };
          return { success: false, error: method };
        }),
      },
    });
  });

  it('keeps actions under the path and opens the public publication URL', async () => {
    const { openExternalHref } = await import('@/components/people/peopleContactActions');
    const user = userEvent.setup();
    render(
      <PluginEntryEditor
        pluginId="dome-cms"
        template={template}
        note={note}
        destination={{
          repo: 'owner/site',
          branch: 'main',
          contentPaths: { 'blog/es': 'src/content/blog/es', 'blog/en': 'src/content/blog/en' },
          siteUrl: 'https://example.com',
          sitePathPattern: '/{collection}/{slug}',
        }}
        publishing={false}
        onNote={vi.fn()}
        onPublish={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    const title = screen.getByLabelText(i18n.t('plugins.field_title'));
    const path = screen.getByText('src/content/blog/es/prueba.md');
    const view = screen.getByRole('button', { name: i18n.t('plugins.view_publication') });
    expect(title.compareDocumentPosition(path) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(path.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: i18n.t('plugins.adapt_languages') })).toBeEnabled();

    await user.click(view);
    expect(openExternalHref).toHaveBeenCalledWith('https://example.com/blog/prueba');
  });
});
