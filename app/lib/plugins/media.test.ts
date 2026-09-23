import { describe, expect, it, vi } from 'vitest';
import {
  editorMediaSrc,
  ingestLocalMarkdownImages,
  isLocalMediaUrl,
  parseDomeMediaId,
  pluginSiteImageFolder,
  pluginSiteImageMap,
  pluginSiteImageName,
} from './media';

vi.mock('@/lib/plugins/request', () => ({
  requestPlugin: vi.fn(async (_pluginId: string, method: string) => {
    if (method !== 'media.attach') throw new Error(method);
    return { id: '11111111-1111-4111-8111-111111111111' };
  }),
}));

describe('plugin media helpers', () => {
  it('parses dome-media identifiers and local blob urls', () => {
    expect(parseDomeMediaId('dome-media:11111111-1111-4111-8111-111111111111')).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(isLocalMediaUrl('blob:http://localhost:5173/abc')).toBe(true);
    expect(isLocalMediaUrl('/media/prueba/foto.png')).toBe(false);
  });

  it('rewrites note blob images to dome-media references', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const result = await ingestLocalMarkdownImages(
      'dome-cms',
      'note-1',
      `![1.00](data:image/png;base64,${png})`,
    );
    expect(result.changed).toBe(true);
    expect(result.markdown).toBe('![1.00](dome-media:11111111-1111-4111-8111-111111111111)');
  });

  it('maps public site paths to vault images for the editor', () => {
    const images = pluginSiteImageMap([
      { id: 'img-1', name: 'foto.png', sitePath: '/dome-recursos-landing/foto.png' },
    ]);
    expect(pluginSiteImageFolder('/dome-recursos-landing/foto.png')).toBe('dome-recursos-landing');
    expect(pluginSiteImageName('/dome-recursos-landing/foto.png')).toBe('foto.png');
    expect(editorMediaSrc('dome-media:11111111-1111-4111-8111-111111111111', images))
      .toBe('dome-media:11111111-1111-4111-8111-111111111111');
    expect(editorMediaSrc('/dome-recursos-landing/foto.png', images)).toBe('dome-media:img-1');
    expect(editorMediaSrc('/missing.png', images)).toBe('/missing.png');
    expect(editorMediaSrc('https://example.com/foto.png', images)).toBe('https://example.com/foto.png');
  });
});
