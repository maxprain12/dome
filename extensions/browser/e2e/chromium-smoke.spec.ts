import { chromium, expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(root, '../.output/chrome-mv3');

test.describe('Chrome extension smoke', () => {
  test('loads the unpacked MV3 service worker', async () => {
    test.skip(!existsSync(path.join(extensionPath, 'manifest.json')), 'Run extension:build first');
    const context = await chromium.launchPersistentContext('', {
      // Full Chromium (not headless-shell). CI wraps this in xvfb.
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    try {
      const existing = context.serviceWorkers()[0];
      const worker = existing || (await context.waitForEvent('serviceworker', { timeout: 20_000 }));
      expect(worker.url()).toMatch(/chrome-extension:\/\//);
      expect(worker.url()).toMatch(/background/);
    } finally {
      await context.close();
    }
  });
});
