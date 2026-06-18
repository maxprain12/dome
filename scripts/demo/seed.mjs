#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

// Generate PDF first
await import('./generate-demo-pdf.mjs');

const electronBin = path.join(ROOT, 'node_modules', 'electron', 'cli.js');
const demoMain = path.join(ROOT, 'electron', 'demo', 'main.cjs');

const child = spawn(process.execPath, [electronBin, demoMain, ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    DOME_PROFILE: process.env.DOME_PROFILE || 'video-demo',
    NODE_ENV: 'development',
  },
});

child.on('exit', (code) => process.exit(code ?? 1));
