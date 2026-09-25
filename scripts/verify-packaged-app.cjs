'use strict';

/**
 * Post-pack checks on the real app.asar (called from scripts/after-pack.cjs).
 *
 *  - Every package inside app.asar must be able to `require()` each of its
 *    non-optional `dependencies` with Node resolution inside the archive.
 *    A miss here is a guaranteed `Cannot find module` in the packaged app
 *    (Dome 2.9.0 / 2.9.1).
 *  - Native prebuilt families must ship the binary for the TARGET arch, not the
 *    host arch (x64 builds produced on an arm64 Mac).
 */

const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

/** Prebuilt families whose platform package must match `<platform>-<arch>`. */
const NATIVE_FAMILIES = ['@img/sharp-', '@lancedb/lancedb-', '@napi-rs/canvas-', '@ffmpeg-installer/'];

/** electron-builder `Arch` enum → Node arch name. */
const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' };

function archName(arch) {
  if (typeof arch === 'string') return arch;
  return ARCH_NAMES[arch] ?? String(arch);
}

/**
 * Directory of the package that owns `pkgJsonPath`, or null when the file is a
 * nested package.json (e.g. `dist/package.json` with only `"type"`).
 * Paths are posix, rooted at `/` (asar listing format).
 */
function packageDirOf(pkgJsonPath) {
  if (pkgJsonPath === '/package.json') return '';
  const parts = pkgJsonPath.split('/');
  const nm = parts.lastIndexOf('node_modules');
  if (nm === -1) return null;
  const rest = parts.slice(nm + 1);
  const isRoot = rest.length === 2 || (rest.length === 3 && rest[0].startsWith('@'));
  return isRoot ? parts.slice(0, -1).join('/') : null;
}

function resolvesFrom(files, fromDir, dep) {
  let dir = fromDir;
  for (;;) {
    if (path.posix.basename(dir) !== 'node_modules' && files.has(`${dir}/node_modules/${dep}/package.json`)) {
      return true;
    }
    if (dir === '') return false;
    dir = path.posix.dirname(dir);
    if (dir === '/') dir = '';
  }
}

/**
 * @param {string[]} fileList asar listing (posix, leading `/`)
 * @param {(archivePath: string) => object | null} readJson
 * @returns {{ dependent: string, dependency: string }[]}
 */
function findUnresolvedDependencies(fileList, readJson) {
  const files = new Set(fileList);
  const missing = [];
  for (const file of fileList) {
    if (!file.endsWith('/package.json')) continue;
    const pkgDir = packageDirOf(file);
    if (pkgDir === null) continue;
    const pkg = readJson(file);
    if (!pkg) continue;
    const optional = pkg.optionalDependencies || {};
    for (const dep of Object.keys(pkg.dependencies || {})) {
      if (dep in optional) continue;
      if (!resolvesFrom(files, pkgDir, dep)) {
        missing.push({ dependent: pkgDir || '/', dependency: dep });
      }
    }
  }
  return missing;
}

/**
 * @param {string[]} unpackedPackages package names under app.asar.unpacked/node_modules
 * @returns {{ family: string, expected: string, found: string[] }[]}
 */
function findArchMismatches(unpackedPackages, platform, arch) {
  const target = archName(arch);
  if (target === 'universal') return [];
  const mismatches = [];
  for (const family of NATIVE_FAMILIES) {
    const platformPkgs = unpackedPackages.filter((name) => name.startsWith(`${family}${platform}-`));
    if (platformPkgs.length === 0) continue;
    const expected = `${family}${platform}-${target}`;
    if (!platformPkgs.some((name) => name === expected || name.startsWith(`${expected}-`))) {
      mismatches.push({ family, expected, found: platformPkgs });
    }
  }
  return mismatches;
}

function listUnpackedPackages(unpackedNodeModules) {
  if (!fs.existsSync(unpackedNodeModules)) return [];
  const names = [];
  for (const entry of fs.readdirSync(unpackedNodeModules)) {
    if (entry.startsWith('@')) {
      for (const sub of fs.readdirSync(path.join(unpackedNodeModules, entry))) names.push(`${entry}/${sub}`);
    } else {
      names.push(entry);
    }
  }
  return names;
}

function scanAsarDependencies(asarPath) {
  const fileList = asar.listPackage(asarPath).map((f) => f.replaceAll('\\', '/'));
  return findUnresolvedDependencies(fileList, (file) => {
    try {
      return JSON.parse(asar.extractFile(asarPath, file.slice(1)).toString('utf8'));
    } catch {
      return null;
    }
  });
}

module.exports = {
  archName,
  findArchMismatches,
  findUnresolvedDependencies,
  listUnpackedPackages,
  packageDirOf,
  scanAsarDependencies,
};
