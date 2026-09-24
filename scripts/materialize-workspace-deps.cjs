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
const WORKSPACE_PKGS = ['ai', 'agent-core', 'tools', 'db'];

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

  // @dome/db ships its Drizzle SQL migrations alongside dist/ (resolved at
  // runtime via getMigrationsFolder() = <package-root>/../drizzle). Without
  // this, packaged builds silently skip every Drizzle migration — see
  // electron/core/db/drizzle-bridge.cjs ("Drizzle migrations folder missing").
  const drizzleSrc = path.join(realPkgDir, 'drizzle');
  if (fs.existsSync(drizzleSrc)) {
    fs.cpSync(drizzleSrc, path.join(destDir, 'drizzle'), { recursive: true });
  }
}

if (!fs.existsSync(scopeDir)) {
  fail(`Missing ${scopeDir} — run pnpm install`);
}

for (const name of WORKSPACE_PKGS) {
  const linkPath = path.join(scopeDir, name);
  const sourcePkgDir = path.join(root, 'packages', name);

  if (!fs.existsSync(linkPath)) {
    fail(`Missing @dome/${name} in node_modules`);
  }
  if (!fs.existsSync(sourcePkgDir)) {
    fail(`Missing packages/${name} — workspace package not checked out`);
  }

  const indexJs = path.join(sourcePkgDir, 'dist', 'index.js');
  if (!fs.existsSync(indexJs)) {
    fail(`@dome/${name} dist/index.js not built — run pnpm run build:packages`);
  }

  const stat = fs.lstatSync(linkPath);
  if (stat.isSymbolicLink()) {
    const tmpDir = path.join(scopeDir, `.${name}.materialize.tmp`);
    copyPackage(sourcePkgDir, tmpDir);
    fs.rmSync(linkPath);
    fs.renameSync(tmpDir, linkPath);
    console.log(`[materialize-workspace-deps] Materialized @dome/${name} from ${sourcePkgDir}`);
  } else {
    // Idempotent: CI runs materialize twice (build step + electron:pack). Always copy
    // from packages/, never from node_modules/@dome/* (copyPackage rmSync would delete source).
    copyPackage(sourcePkgDir, linkPath);
    console.log(`[materialize-workspace-deps] Refreshed @dome/${name} from ${sourcePkgDir}`);
  }
}

// pnpm keeps transitive deps as symlinks into .pnpm. electron-builder copies the
// package but not that store, so require('once') from inflight fails in the asar.
const HOISTED_RUNTIME = ['once', 'wrappy'];

function materializeHoisted(name) {
  const dest = path.join(root, 'node_modules', name);
  if (!fs.existsSync(dest)) {
    fail(`Missing node_modules/${name} — it must be a direct dependency`);
  }
  const real = fs.realpathSync(dest);
  const tmp = `${dest}.materialize.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.cpSync(real, tmp, {
    recursive: true,
    filter: (src) => src === real || !src.includes(`${path.sep}node_modules${path.sep}`),
  });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(tmp, dest);
  console.log(`[materialize-workspace-deps] Materialized ${name}`);
}

for (const name of HOISTED_RUNTIME) {
  materializeHoisted(name);
}

console.log('[materialize-workspace-deps] Done');
