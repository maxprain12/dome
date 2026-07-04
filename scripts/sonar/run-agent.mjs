#!/usr/bin/env node
/**
 * Run Dome Sonar quality-loop agent.
 *
 * - Default (local): Electron headless harness
 * - CI / Coolify (SONAR_LOOP_NODE=1 or JENKINS_URL): pure Node — no Electron binary, no apt/root
 *
 * Usage:
 *   MINIMAX_API_KEY=... pnpm run sonar:run-agent -- --batch=.quality-loop/batch.json
 *   SONAR_LOOP_NODE=1 pnpm run sonar:run-agent -- --dry-run
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

const extraArgs = process.argv.slice(2);
const dash = extraArgs.indexOf('--');
const flags = dash >= 0 ? extraArgs.slice(dash + 1) : extraArgs;

const useNodeHarness =
  process.env.SONAR_LOOP_NODE === '1' ||
  process.env.SONAR_LOOP_NODE === 'true' ||
  Boolean(process.env.JENKINS_URL);

const entry = useNodeHarness
  ? path.join(ROOT, 'electron', 'sonar-loop', 'main-node.cjs')
  : path.join(ROOT, 'electron', 'sonar-loop', 'main.cjs');

const spawnArgs = useNodeHarness
  ? [entry, ...flags]
  : [path.join(ROOT, 'node_modules', 'electron', 'cli.js'), entry, ...flags];

const child = spawn(process.execPath, spawnArgs, {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    ...(useNodeHarness ? { SONAR_LOOP_NODE: '1' } : { ELECTRON_RUN_AS_NODE: undefined }),
  },
});

child.on('exit', (code) => process.exit(code ?? 1));
