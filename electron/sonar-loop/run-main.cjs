'use strict';
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const { parseSonarLoopArgs } = require('./parse-args.cjs');
const { applyProviderSettings } = require('./provider-config.cjs');
const { runSonarBatch } = require('./run-batch.cjs');

const database = require('../core/database.cjs');
const runEngine = require('../agents/run-engine.cjs');

/**
 * @param {string[]} argv CLI args after `--`
 * @returns {Promise<number>} exit code
 */
async function runSonarLoopMain(argv) {
  const args = parseSonarLoopArgs(argv);
  const userData =
    process.env.DOME_SONAR_LOOP_USER_DATA || path.join(require('os').homedir(), '.dome-sonar-loop');
  console.log('[SonarLoop] userData:', userData);
  console.log('[SonarLoop] runtime:', process.env.SONAR_LOOP_NODE === '1' ? 'node' : 'electron');

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
    return 1;
  }
  console.log('[SonarLoop] Done.');
  return 0;
}

module.exports = { runSonarLoopMain };
