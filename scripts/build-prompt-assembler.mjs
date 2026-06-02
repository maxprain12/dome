#!/usr/bin/env node
/** Compile shared/prompt-assembler/index.ts → index.cjs for Electron main process. */
import { createRequire } from 'module';
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const entry = path.join(root, 'shared/prompt-assembler/index.ts');
const outfile = path.join(root, 'shared/prompt-assembler/index.cjs');

function loadEsbuild() {
  const requireFromRoot = createRequire(path.join(root, 'package.json'));
  try {
    return requireFromRoot('esbuild');
  } catch {
    const pnpmDir = path.join(root, 'node_modules/.pnpm');
    const match = readdirSync(pnpmDir).find((d) => d.startsWith('esbuild@'));
    if (!match) {
      throw new Error('esbuild not found — run pnpm install');
    }
    const pkgJson = path.join(pnpmDir, match, 'node_modules/esbuild/package.json');
    return createRequire(pkgJson)('.');
  }
}

const { build } = loadEsbuild();

await build({
  entryPoints: [entry],
  outfile,
  bundle: false,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'info',
});

console.log('[build:prompt-assembler] wrote', outfile);
