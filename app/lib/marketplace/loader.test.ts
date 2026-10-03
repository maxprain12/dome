import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAvailablePlugins, loadAvailableSkills } from './loader';
import bundledPlugins from './data/plugins.json';
import bundledSkills from './data/skills.json';

afterEach(() => vi.unstubAllGlobals());
describe('bundled add-ons when catalog transport is unavailable', () => {
  it('keeps CMS and official skills discoverable offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await loadAvailablePlugins()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'dome-cms', bundled: 'dome-cms' })]));
    expect(await loadAvailableSkills()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'dome-social-insights' })]));
  });

  it('matches the catalogs served from public', () => {
    expect(JSON.parse(readFileSync(new URL('../../../public/plugins.json', import.meta.url), 'utf8'))).toEqual(bundledPlugins);
    expect(JSON.parse(readFileSync(new URL('../../../public/skills.json', import.meta.url), 'utf8'))).toEqual(bundledSkills);
  });
});
