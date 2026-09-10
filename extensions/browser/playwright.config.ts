import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  timeout: 30_000,
  retries: 0,
  reporter: 'line',
  use: {
    trace: 'retain-on-failure',
  },
});
