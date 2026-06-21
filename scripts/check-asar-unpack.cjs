#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/**
 * Guard: native addons & bundled binaries MUST be in `build.asarUnpack`.
 *
 * Why this exists
 * ---------------
 * Files inside `app.asar` cannot be executed (`spawn` -> ENOTDIR) and many
 * native loaders cannot `dlopen` from the archive. In a packaged build this
 * surfaces as an UNCAUGHT async error that aborts the main process — and it is
 * invisible in dev (modules live in a plain `node_modules/`). This is exactly
 * what crashed Dome 2.6.0: `@ffmpeg-installer` resolved the ffmpeg binary to a
 * path inside `app.asar`, fluent-ffmpeg's capability probe `spawn`ed it, threw
 * ENOTDIR from a timer callback, and killed CrBrowserMain ~30–90s after launch.
 *
 * What it checks (fast, no electron-builder packaging needed — runs on every PR)
 * -----------------------------------------------------------------------------
 *  1. Every PRODUCTION dependency that ships a native `.node` addon (or a
 *     `binding.gyp`) is covered by an `asarUnpack` glob.
 *  2. Every known binary-shipping installer (see BINARY_PACKAGE_PREFIXES) is
 *     covered by an `asarUnpack` glob.
 *  3. `scripts/after-pack.cjs` `criticalModules` are all covered by an
 *     `asarUnpack` glob (the two lists must stay consistent).
 *
 * Only PRODUCTION deps are considered — electron-builder only bundles those.
 * Build/dev-only native modules (rollup, @parcel/watcher, fsevents,
 * iconv-corefoundation, …) are intentionally ignored.
 *
 * If you add a dependency that loads a `.node` addon or `spawn`s a binary:
 *   - add a `node_modules/<pkg>/` glob to `build.asarUnpack` in package.json
 *   - if it ships a binary (no `.node`), also add its name prefix below
 *   - never pass an installer's raw `.path` to spawn/setFfmpegPath: rewrite
 *     `…/app.asar/…` -> `…/app.asar.unpacked/…` first (see
 *     electron/media/ffmpeg-paths.cjs).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// Binary-shipping installers that DON'T contain a `.node` file (so the native
// scan won't catch them). Matched as name prefixes. Add new ones here.
const BINARY_PACKAGE_PREFIXES = ['@ffmpeg-installer/'];

function fail(lines) {
  console.error('\n❌ asar-unpack check FAILED\n');
  for (const l of lines) console.error('   ' + l);
  console.error('\nFix: add the package(s) to `build.asarUnpack` in package.json');
  console.error('     (and, if a spawned binary, to BINARY_PACKAGE_PREFIXES /');
  console.error('      after-pack.cjs criticalModules). See scripts/check-asar-unpack.cjs.\n');
  process.exit(1);
}

/** Package name = segment after the LAST `node_modules/` in a path. */
function pkgNameFromPath(p) {
  const idx = p.lastIndexOf('node_modules' + path.sep);
  if (idx === -1) return null;
  const rest = p.slice(idx + ('node_modules' + path.sep).length);
  const parts = rest.split(path.sep);
  if (!parts[0]) return null;
  return parts[0].startsWith('@') && parts[1] ? `${parts[0]}/${parts[1]}` : parts[0];
}

/** Set of production dependency package names (via pnpm prod tree). */
function getProdPackages() {
  let out;
  try {
    out = execSync('pnpm ls --prod --depth Infinity --parseable', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    // Non-zero exit can still carry usable stdout
    out = (e.stdout && e.stdout.toString()) || '';
  }
  const set = new Set();
  for (const line of out.split('\n')) {
    const name = pkgNameFromPath(line.trim());
    if (name) set.add(name);
  }
  if (set.size === 0) {
    fail(['Could not resolve the production dependency tree (pnpm ls returned nothing).']);
  }
  return set;
}

/** Walk a dir, calling fn(fullPath) for each file; bounded depth, no inner node_modules recursion beyond pnpm layout. */
function walk(dir, fn) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, fn);
    else fn(full);
  }
}

/** Discover packages (in the pnpm store) that contain a native `.node` file or a root binding.gyp. */
function discoverNativePackages() {
  const store = path.join(ROOT, 'node_modules', '.pnpm');
  const found = new Set();
  if (!fs.existsSync(store)) {
    // Fallback: scan top-level node_modules (non-pnpm layouts)
    walk(path.join(ROOT, 'node_modules'), (f) => {
      if (f.endsWith('.node') || path.basename(f) === 'binding.gyp') {
        const n = pkgNameFromPath(f);
        if (n && !n.startsWith('.')) found.add(n);
      }
    });
    return found;
  }
  for (const variant of fs.readdirSync(store)) {
    const nm = path.join(store, variant, 'node_modules');
    if (!fs.existsSync(nm)) continue;
    walk(nm, (f) => {
      if (f.endsWith('.node') || path.basename(f) === 'binding.gyp') {
        const n = pkgNameFromPath(f);
        if (n && !n.startsWith('.')) found.add(n);
      }
    });
  }
  return found;
}

/** Convert an asarUnpack glob into a RegExp matching a probe path under the package. */
function globToRegExp(glob) {
  // normalize to forward slashes for matching
  let g = glob.replace(/\\/g, '/');
  let re = '^';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        re += '.*';
        i++;
        if (g[i + 1] === '/') i++; // consume `**/`
      } else {
        re += '[^/]*';
      }
    } else if ('.+?^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  re += '$';
  return new RegExp(re);
}

function isCovered(pkgName, unpackRegexes) {
  const probe = `node_modules/${pkgName}/__probe__.node`;
  return unpackRegexes.some((r) => r.test(probe));
}

function main() {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const unpack = (pkgJson.build && pkgJson.build.asarUnpack) || [];
  if (!Array.isArray(unpack) || unpack.length === 0) {
    fail(['package.json build.asarUnpack is missing or empty.']);
  }
  const unpackRegexes = unpack.map(globToRegExp);

  const prod = getProdPackages();
  const native = discoverNativePackages();

  // Production native packages that must be unpacked.
  const mustUnpack = new Set();
  for (const n of native) if (prod.has(n)) mustUnpack.add(n);

  // Production binary-installer packages (by name prefix) that must be unpacked.
  for (const name of prod) {
    if (BINARY_PACKAGE_PREFIXES.some((pre) => name.startsWith(pre))) mustUnpack.add(name);
  }

  const uncovered = [...mustUnpack].filter((n) => !isCovered(n, unpackRegexes)).sort();

  // Consistency: after-pack criticalModules must each be covered by an asarUnpack glob.
  const afterPackSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'after-pack.cjs'), 'utf8');
  const cmBlock = afterPackSrc.match(/criticalModules\s*=\s*\[([\s\S]*?)\]/);
  const criticalModules = cmBlock
    ? [...cmBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
    : [];
  const criticalUncovered = criticalModules
    .filter((m) => {
      const name = m.replace(/^node_modules\//, '');
      return !isCovered(name, unpackRegexes);
    })
    .sort();

  const problems = [];
  if (uncovered.length) {
    problems.push('Production native/binary packages NOT in asarUnpack:');
    for (const n of uncovered) problems.push(`  • ${n}`);
  }
  if (criticalUncovered.length) {
    problems.push('after-pack.cjs criticalModules NOT covered by asarUnpack:');
    for (const n of criticalUncovered) problems.push(`  • ${n}`);
  }
  if (problems.length) fail(problems);

  console.log('✅ asar-unpack check passed');
  console.log(`   ${mustUnpack.size} production native/binary package(s) verified in asarUnpack:`);
  for (const n of [...mustUnpack].sort()) console.log(`     - ${n}`);
}

main();
