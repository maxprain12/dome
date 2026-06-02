#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const electronBin = path.join(ROOT, 'node_modules', 'electron', 'cli.js');
const benchMain = path.join(ROOT, 'electron', 'bench', 'main.cjs');

const child = spawn(process.execPath, [electronBin, benchMain, '--seed-only'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' },
});
child.on('exit', (code) => process.exit(code ?? 1));
