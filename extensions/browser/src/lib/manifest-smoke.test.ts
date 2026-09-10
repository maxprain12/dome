/* eslint-disable dome/no-renderer-node-imports -- Node-side build test; never bundled into the renderer. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readManifest(rel: string) {
  const file = path.join(root, rel);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as {
    manifest_version: number;
    side_panel?: { default_path: string };
    sidebar_action?: { default_panel: string };
    permissions?: string[];
    host_permissions?: string[];
    content_scripts?: unknown[];
    action?: { default_popup?: string };
  };
}

describe('cross-browser extension manifests', () => {
  it('builds Chrome/Firefox/Safari without a persistent all_urls content script', () => {
    const manifests = [
      readManifest('.output/chrome-mv3/manifest.json'),
      readManifest('.output/firefox-mv3/manifest.json') || readManifest('.output/firefox-mv2/manifest.json'),
      readManifest('.output/safari-mv3/manifest.json') || readManifest('.output/safari-mv2/manifest.json'),
    ].filter(Boolean);

    if (manifests.length === 0) {
      if (process.env.EXTENSION_REQUIRE_BUILD === '1') {
        throw new Error('Extension build output is missing. Run pnpm run extension:build first.');
      }
      return;
    }

    expect(manifests.length).toBeGreaterThanOrEqual(2);
    expect(readManifest('.output/chrome-mv3/manifest.json')?.side_panel?.default_path).toBe('sidebar.html');
    expect(readManifest('.output/firefox-mv3/manifest.json')?.sidebar_action?.default_panel).toBe('sidebar.html');
    for (const manifest of manifests) {
      expect(manifest?.permissions).toEqual(expect.arrayContaining(['activeTab', 'scripting', 'storage', 'contextMenus']));
      const hosts = [...(manifest?.host_permissions || []), ...(manifest?.permissions || [])];
      expect(hosts.some((h) => h.includes('127.0.0.1:37215'))).toBe(true);
      expect(hosts.some((h) => h === 'http://*/*' || h === 'https://*/*' || h === '<all_urls>')).toBe(false);
      expect(manifest?.action?.default_popup).toBeUndefined();
      expect(JSON.stringify(manifest?.content_scripts || [])).not.toContain('<all_urls>');
    }
  });
});
