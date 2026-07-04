/* eslint-disable no-console */
/**
 * Electron headless entry — Sonar quality loop agent (Dome harness + MiniMax).
 * Usage: node scripts/sonar/run-agent.mjs -- --batch=.quality-loop/batch.json
 */
const path = require('path');
const os = require('os');

const { loadDotenv } = require('../bench/load-env.cjs');
loadDotenv();

const sonarUserData =
  process.env.DOME_SONAR_LOOP_USER_DATA || path.join(os.homedir(), '.dome-sonar-loop');
process.env.DOME_SONAR_LOOP_USER_DATA = sonarUserData;
process.env.DOME_BENCH = '1';

const { app } = require('electron');
app.setPath('userData', sonarUserData);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');

const { runSonarLoopMain } = require('./run-main.cjs');

app.whenReady()
  .then(() => runSonarLoopMain(process.argv.slice(2)))
  .then((code) => app.exit(code))
  .catch((err) => {
    console.error('[SonarLoop] Fatal:', err);
    app.exit(1);
  });
