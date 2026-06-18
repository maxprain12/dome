/* eslint-disable no-console */
/**
 * Headless entry to seed video-demo profile.
 * Usage: DOME_PROFILE=video-demo electron electron/demo/main.cjs
 */
const path = require('path');
const os = require('os');
const { app } = require('electron');

// Match production app name so userData resolves to ~/.config/dome-wt-<profile>
app.setName('dome');

if (process.env.DOME_PROFILE && String(process.env.DOME_PROFILE).trim()) {
  const safe = String(process.env.DOME_PROFILE).replace(/[^a-zA-Z0-9._-]/g, '_');
  const def = app.getPath('userData');
  const next = path.join(path.dirname(def), `${path.basename(def)}-wt-${safe}`);
  app.setPath('userData', next);
  console.log('[Demo] userData:', next);
}

app.disableHardwareAcceleration();

const { seedVideoDemo } = require('./seed.cjs');

app.whenReady().then(async () => {
  try {
    await seedVideoDemo({ force: process.argv.includes('--force') });
    app.exit(0);
  } catch (err) {
    console.error('[Demo] Seed failed:', err);
    app.exit(1);
  }
});
