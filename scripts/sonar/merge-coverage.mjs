#!/usr/bin/env node
/**
 * Merge partial lcov files into coverage/lcov.info for SonarQube.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'coverage');
const outFile = path.join(outDir, 'lcov.info');

const inputs = [
  path.join(root, 'coverage/electron/lcov.info'),
  path.join(root, 'packages/agent-core/coverage/lcov.info'),
].filter((p) => fs.existsSync(p));

if (inputs.length === 0) {
  console.warn('No lcov inputs found — skipping merge');
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

/** Simple lcov merge: concatenate SF records (Sonar accepts multi-root lcov). */
let merged = '';
for (const input of inputs) {
  merged += fs.readFileSync(input, 'utf8');
  if (!merged.endsWith('\n')) merged += '\n';
}

fs.writeFileSync(outFile, merged);
console.log(`Merged ${inputs.length} lcov file(s) → ${outFile}`);
