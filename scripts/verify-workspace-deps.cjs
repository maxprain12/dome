#!/usr/bin/env node
/**
 * Verify @dome workspace packages are built and materialized (not symlinks)
 * before electron-builder runs.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const scopeDir = path.join(root, 'node_modules', '@dome');
const WORKSPACE_PKGS = ['ai', 'agent-core', 'tools'];

let ok = true;

for (const name of WORKSPACE_PKGS) {
  const pkgDir = path.join(scopeDir, name);
  const indexJs = path.join(pkgDir, 'dist', 'index.js');

  if (!fs.existsSync(pkgDir)) {
    console.error(`❌ @dome/${name}: missing ${pkgDir}`);
    ok = false;
    continue;
  }
  if (fs.lstatSync(pkgDir).isSymbolicLink()) {
    console.error(`❌ @dome/${name}: still a symlink — run pnpm run materialize:workspace-deps`);
    ok = false;
    continue;
  }
  if (!fs.existsSync(indexJs)) {
    console.error(`❌ @dome/${name}: missing dist/index.js`);
    ok = false;
    continue;
  }
  console.log(`✅ @dome/${name}`);
}

if (!ok) {
  process.exit(1);
}
