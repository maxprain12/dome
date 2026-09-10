#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(root, '../.output/safari-mv2');
const mv3 = path.resolve(root, '../.output/safari-mv3');
const dir = existsSync(mv3) ? mv3 : output;

if (!existsSync(dir)) {
  console.error('[extension:safari] Build Safari first: pnpm --filter @dome/browser-extension run build:safari');
  process.exit(1);
}

const packed = spawnSync('xcrun', ['safari-web-extension-packager', dir], {
  stdio: 'inherit',
});
if (packed.error && packed.error.code === 'ENOENT') {
  console.log('[extension:safari] xcrun safari-web-extension-packager is not available.');
  console.log(`[extension:safari] Load this folder in Safari: ${dir}`);
  process.exit(0);
}
process.exit(packed.status ?? 0);
