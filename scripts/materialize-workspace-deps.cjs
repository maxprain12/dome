#!/usr/bin/env node
/**
 * Materialize pnpm workspace symlinks under node_modules/@dome/* before packaging.
 *
 * pnpm links workspace:* deps as symlinks to packages/*. electron-builder copies
 * those symlinks into app.asar, but packages/ is not inside the asar → runtime
 * Cannot find module '@dome/ai/dist/index.js'.
 *
 * Run after `build:packages` and before electron-builder.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const scopeDir = path.join(root, 'node_modules', '@dome');

/** Main-process runtime packages (dynamic import from electron/). */
const WORKSPACE_PKGS = ['ai', 'agent-core', 'tools'];

function fail(msg) {
  console.error(`[materialize-workspace-deps] ${msg}`);
  process.exit(1);
}

function copyPackage(realPkgDir, destDir) {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  const pkgJsonSrc = path.join(realPkgDir, 'package.json');
  if (!fs.existsSync(pkgJsonSrc)) {
    fail(`package.json missing in ${realPkgDir}`);
  }
  fs.copyFileSync(pkgJsonSrc, path.join(destDir, 'package.json'));

  const distSrc = path.join(realPkgDir, 'dist');
  if (!fs.existsSync(distSrc)) {
    fail(`dist/ missing in ${realPkgDir} — run pnpm run build:packages first`);
  }
  fs.cpSync(distSrc, path.join(destDir, 'dist'), { recursive: true });
}

if (!fs.existsSync(scopeDir)) {
  fail(`Missing ${scopeDir} — run pnpm install`);
}

for (const name of WORKSPACE_PKGS) {
  const linkPath = path.join(scopeDir, name);
  if (!fs.existsSync(linkPath)) {
    fail(`Missing @dome/${name} in node_modules`);
  }

  const stat = fs.lstatSync(linkPath);
  const realPkgDir = stat.isSymbolicLink() ? fs.realpathSync(linkPath) : linkPath;
  const indexJs = path.join(realPkgDir, 'dist', 'index.js');
  if (!fs.existsSync(indexJs)) {
    fail(`@dome/${name} dist/index.js not built — run pnpm run build:packages`);
  }

  if (stat.isSymbolicLink()) {
    const tmpDir = path.join(scopeDir, `.${name}.materialize.tmp`);
    copyPackage(realPkgDir, tmpDir);
    fs.rmSync(linkPath);
    fs.renameSync(tmpDir, linkPath);
    console.log(`[materialize-workspace-deps] Materialized @dome/${name} from ${realPkgDir}`);
  } else {
    // Refresh dist in an already-materialized directory (idempotent rebuilds).
    copyPackage(realPkgDir, linkPath);
    console.log(`[materialize-workspace-deps] Refreshed @dome/${name}`);
  }
}

console.log('[materialize-workspace-deps] Done');
