#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */
/**
 * Node-only Sonar loop harness (no Electron binary — for CI/Coolify without root).
 * Usage: node electron/sonar-loop/main-node.cjs -- --batch=.quality-loop/batch.json
 */
process.env.SONAR_LOOP_NODE = '1';

const { bootstrapSonarLoopNodeEnv } = require('./node-env.cjs');
bootstrapSonarLoopNodeEnv();

const { runSonarLoopMain } = require('./run-main.cjs');

runSonarLoopMain(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[SonarLoop] Fatal:', err);
    process.exit(1);
  });
