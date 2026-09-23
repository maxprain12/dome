import { describe, expect, it } from 'vitest';
import {
  hasLocalMedia,
  pluginSelectOptionLabel,
  publicEntryUrl,
  siblingLanguageKeys,
  slugifyPluginTitle,
} from './fields';

describe('plugin field helpers', () => {
  it('slugifies titles for CMS filenames', () => {
    expect(slugifyPluginTitle('Getting Started')).toBe('getting-started');
    expect(slugifyPluginTitle('Prueba 1')).toBe('prueba-1');
  });

  it('shows language names and capitalizes other select options', () => {
    expect(pluginSelectOptionLabel('language', 'es', 'es')).toMatch(/español/i);
    expect(pluginSelectOptionLabel('collection', 'blog', 'es')).toBe('Blog');
  });

  it('builds the public publication URL from the configured pattern', () => {
    expect(publicEntryUrl({
      repo: 'owner/site',
      branch: 'main',
      siteUrl: 'https://example.com/',
      sitePathPattern: '/{collection}/{slug}',
    }, { collection: 'blog', language: 'es', slug: 'prueba' })).toBe('https://example.com/blog/prueba');
    expect(publicEntryUrl({
      repo: 'owner/site',
      branch: 'main',
      siteUrl: 'https://example.com',
      sitePathPattern: '/{language}/{collection}/{slug}',
    }, { collection: 'blog', language: 'es', slug: 'prueba' })).toBe('https://example.com/es/blog/prueba');
  });

  it('lists sibling languages from the same collection mapping', () => {
    expect(siblingLanguageKeys({
      'blog/es': 'src/content/blog/es',
      'blog/en': 'src/content/blog/en',
      'manual/es': 'src/content/manual/es',
    }, 'blog', 'es')).toEqual(['en']);
  });

  it('detects blob and localhost media that cannot be published', () => {
    expect(hasLocalMedia('![1.00](blob:http://localhost:5173/abc)', {})).toBe(true);
    expect(hasLocalMedia('![ok](/media/prueba/foto.png)', {})).toBe(false);
  });
});
