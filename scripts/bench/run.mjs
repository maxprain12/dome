#!/usr/bin/env node
/**
 * Spawn Electron headless bench harness.
 * Usage: pnpm run bench:run -- [--grep web] [--grep 'studio|ui|file'] [--category studio,ui,file]
 */
import { spawn } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { buildElectronLaunchArgs } = require('../../electron/bench/electron-launch-args.cjs');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

const electronBin = path.join(ROOT, 'node_modules', 'electron', 'cli.js');
const benchMain = path.join(ROOT, 'electron', 'bench', 'main.cjs');

const extraArgs = process.argv.slice(2);
const dash = extraArgs.indexOf('--');
const flags = dash >= 0 ? extraArgs.slice(dash + 1) : extraArgs;
const electronArgs = buildElectronLaunchArgs({ benchMain, flags });

const child = spawn(
  process.execPath,
  [electronBin, ...electronArgs],
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
