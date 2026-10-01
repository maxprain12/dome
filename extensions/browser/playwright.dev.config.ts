import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Workers inherit this value and load the actual WXT development output.
process.env.DOME_EXTENSION_BUILD = 'dev';

export default defineConfig(base, {
  workers: 1,
  webServer: {
    command: 'pnpm exec wxt --port 3017',
    url: 'http://localhost:3017/entrypoints/sidebar/main.tsx',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
