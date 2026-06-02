#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const benchDir = process.env.DOME_BENCH_USER_DATA || path.join(os.homedir(), '.dome-bench');

if (fs.existsSync(benchDir)) {
  fs.rmSync(benchDir, { recursive: true, force: true });
  console.log(`[bench:clean] Removed ${benchDir}`);
} else {
  console.log(`[bench:clean] Nothing to remove at ${benchDir}`);
}
