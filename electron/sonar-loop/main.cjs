/* eslint-disable no-console */
/**
 * Electron headless entry — Sonar quality loop agent (Dome harness + MiniMax).
 * Usage: node scripts/sonar/run-agent.mjs -- --batch=.quality-loop/batch.json
 */
const path = require('path');
const os = require('os');
const fs = require('fs');

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

const { parseSonarLoopArgs } = require('./parse-args.cjs');
const { applyProviderSettings } = require('./provider-config.cjs');
const { runSonarBatch } = require('./run-batch.cjs');

const database = require('../core/database.cjs');
const runEngine = require('../agents/run-engine.cjs');

async function main() {
  const args = parseSonarLoopArgs(process.argv.slice(2));
  console.log('[SonarLoop] userData:', sonarUserData);

  database.initDatabase();
  runEngine.init(null, database, null);

  if (!args.dryRun) {
    applyProviderSettings(args.provider, args.model);
  } else {
    console.log('[SonarLoop] Dry run — no API calls');
  }

  const result = await runSonarBatch(args);
  const outDir = path.resolve('.quality-loop');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'agent-run.json'), `${JSON.stringify(result, null, 2)}\n`);

  console.log('[SonarLoop] Wrote .quality-loop/agent-run.json');
  if (result.error) {
    console.error('[SonarLoop] Failed:', result.error);
    app.exit(1);
    return;
  }
  console.log('[SonarLoop] Done.');
  app.exit(0);
}

app.whenReady().then(main).catch((err) => {
  console.error('[SonarLoop] Fatal:', err);
  app.exit(1);
});
