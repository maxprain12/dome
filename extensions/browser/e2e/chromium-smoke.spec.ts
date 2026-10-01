import { chromium, expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { extensionBuildPath } from './build-path';

const extensionPath = extensionBuildPath;
const playwrightChromePath = chromium.executablePath();
const playwrightArmChromePath = playwrightChromePath.replace(
  'chrome-mac-x64',
  'chrome-mac-arm64',
);
const browserExecutable =
  existsSync(playwrightChromePath)
    ? playwrightChromePath
    : existsSync(playwrightArmChromePath)
      ? playwrightArmChromePath
      : undefined;

test.describe('Chrome extension smoke', () => {
  test('loads the unpacked MV3 service worker and pairing panel', async () => {
    await expect.poll(() => existsSync(path.join(extensionPath, 'manifest.json')), {
      message: 'Extension build is missing', timeout: 10_000,
    }).toBe(true);
    const context = await chromium.launchPersistentContext('', {
      // Full Chromium (not headless-shell). CI wraps this in xvfb.
      ...(browserExecutable
        ? { executablePath: browserExecutable }
        : { channel: 'chromium' as const }),
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
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const id = new URL(worker.url()).host;
      await page.goto(`chrome-extension://${id}/sidebar.html`);
      await expect(page.locator('#dome-pair-code')).toBeVisible();
      await expect(page.locator('.pairing-title')).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
