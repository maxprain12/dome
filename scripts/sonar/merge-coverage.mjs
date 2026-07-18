#!/usr/bin/env node
/**
 * Merge partial lcov files into coverage/lcov.info for SonarQube.
 *
 * Inputs (optional — missing files are skipped):
 *   coverage/electron/lcov.info
 *   coverage/renderer/lcov.info
 *   packages/agent-core/coverage/lcov.info
 *   packages/ai/coverage/lcov.info
 *
 * Package reports often use SF:src/... — rewrite to repo-relative paths.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'coverage');
const outFile = path.join(outDir, 'lcov.info');

/** @type {Array<{ file: string; sfPrefix?: string }>} */
const candidates = [
  { file: path.join(root, 'coverage/electron/lcov.info') },
  { file: path.join(root, 'coverage/renderer/lcov.info') },
  {
    file: path.join(root, 'packages/agent-core/coverage/lcov.info'),
    sfPrefix: 'packages/agent-core/',
  },
  {
    file: path.join(root, 'packages/ai/coverage/lcov.info'),
    sfPrefix: 'packages/ai/',
  },
];

/**
 * @param {string} content
 * @param {string | undefined} sfPrefix
 */
function rewriteSf(content, sfPrefix) {
  if (!sfPrefix) return content;
  return content.replace(/^SF:(.+)$/gm, (_m, sfPath) => {
    const p = String(sfPath);
    if (p.startsWith(sfPrefix) || p.startsWith('packages/')) return `SF:${p}`;
    return `SF:${sfPrefix}${p}`;
  });
}

const inputs = candidates.filter((c) => fs.existsSync(c.file));

if (inputs.length === 0) {
  console.warn('No lcov inputs found — skipping merge');
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

let merged = '';
for (const input of inputs) {
  const raw = fs.readFileSync(input.file, 'utf8');
  merged += rewriteSf(raw, input.sfPrefix);
  if (!merged.endsWith('\n')) merged += '\n';
  console.log(`  + ${path.relative(root, input.file)}`);
}

fs.writeFileSync(outFile, merged);
console.log(`Merged ${inputs.length} lcov file(s) → ${path.relative(root, outFile)}`);
