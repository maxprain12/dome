import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAvailablePlugins, loadAvailableSkills } from './loader';

afterEach(() => vi.unstubAllGlobals());
describe('bundled add-ons when catalog transport is unavailable', () => {
  it('keeps CMS and official skills discoverable offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await loadAvailablePlugins()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'dome-cms', bundled: 'dome-cms' })]));
    expect(await loadAvailableSkills()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'dome-social-insights' })]));
  });
});
