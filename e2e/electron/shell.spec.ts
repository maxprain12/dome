import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

test('boots the isolated shell without exposing the user profile', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'dome-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DOME_PROFILE: profile,
      DOME_DISABLE_ANALYTICS: '1',
    },
  });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.locator('#root')).toBeVisible();
    await expect(window.getByRole('button', { name: /barra lateral/i })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Command' })).toBeVisible();

    const chrome = await window.evaluate(() => {
      const header = document.querySelector<HTMLElement>('.dome-shell-header');
      const command = document.querySelector<HTMLElement>('[data-tour="search"]');
      if (!header || !command) throw new Error('Shell chrome is incomplete');
      const headerStyle = getComputedStyle(header);
      const commandStyle = getComputedStyle(command);
      return {
        platform: header.dataset.platform,
        headerRegion: headerStyle.getPropertyValue('-webkit-app-region'),
        commandRegion: commandStyle.getPropertyValue('-webkit-app-region'),
        leftInset: Number.parseFloat(headerStyle.getPropertyValue('--dome-titlebar-inset-left')),
        rightInset: Number.parseFloat(headerStyle.getPropertyValue('--dome-titlebar-inset-right')),
        headerHeight: header.getBoundingClientRect().height,
      };
    });

    expect(chrome.headerRegion).toBe('drag');
    expect(chrome.commandRegion).toBe('no-drag');
    expect(chrome.headerHeight).toBe(40);
    if (chrome.platform === 'mac') expect(chrome.leftInset).toBeGreaterThanOrEqual(80);
    if (chrome.platform === 'win' || chrome.platform === 'linux') {
      expect(chrome.rightInset).toBeGreaterThanOrEqual(138);
    }

    const newConversation = window.getByRole('button', { name: /nueva conversación/i });
    await expect(newConversation).toBeVisible();
    await expect
      .poll(() => newConversation.evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region')))
      .toBe('no-drag');

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(820, 700);
    });
    await expect(window.getByRole('dialog', { name: 'Many' })).toBeVisible();

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1280, 800);
    });
    await expect(window.getByRole('dialog', { name: 'Many' })).toBeHidden();
    await expect(window.getByRole('complementary', { name: 'Many' })).toBeVisible();
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});
