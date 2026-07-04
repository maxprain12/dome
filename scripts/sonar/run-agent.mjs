#!/usr/bin/env node
/**
 * Run Dome Sonar quality-loop agent (Electron headless harness + MiniMax).
 *
 * Usage:
 *   MINIMAX_API_KEY=... pnpm run sonar:run-agent -- --batch=.quality-loop/batch.json
 *   pnpm run sonar:run-agent -- --provider minimax --model MiniMax-M2.7-highspeed --dry-run
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

const electronBin = path.join(ROOT, 'node_modules', 'electron', 'cli.js');
const mainCjs = path.join(ROOT, 'electron', 'sonar-loop', 'main.cjs');

const extraArgs = process.argv.slice(2);
const dash = extraArgs.indexOf('--');
const flags = dash >= 0 ? extraArgs.slice(dash + 1) : extraArgs;

const child = spawn(
  process.execPath,
  [electronBin, mainCjs, ...flags],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ELECTRON_RUN_AS_NODE: undefined,
    },
  },
);

child.on('exit', (code) => process.exit(code ?? 1));
