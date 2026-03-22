#!/usr/bin/env node
/**
 * After-pack hook for electron-builder
 * Ensures native modules are correctly unpacked and accessible
 */

const fs = require('fs');
const path = require('path');

/**
 * codesign --verify --deep --strict rejects symlinks whose target resolves outside the .app.
 * Python venvs and some wheels leave such links; materialize them as real files/dirs.
 */
function collectSymlinksUnder(rootDir, acc = []) {
  if (!fs.existsSync(rootDir)) return acc;
  let entries;
  try {
    entries = fs.readdirSync(rootDir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const full = path.join(rootDir, name);
    let st;
    try {
      st = fs.lstatSync(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      acc.push(full);
    } else if (st.isDirectory()) {
      collectSymlinksUnder(full, acc);
    }
  }
  return acc;
}

function fixSymlinksOutsideAppBundle(appBundlePath, dirsToScan) {
  let appReal;
  try {
    appReal = fs.realpathSync(appBundlePath);
  } catch (e) {
    console.warn('[AfterPack] Could not realpath app bundle:', e.message);
    return;
  }
  const appPrefix = appReal + path.sep;

  for (let pass = 0; pass < 30; pass += 1) {
    const symlinks = [];
    for (const d of dirsToScan) {
      if (fs.existsSync(d)) {
        collectSymlinksUnder(d, symlinks);
      }
    }
    symlinks.sort((a, b) => b.length - a.length);

    let changed = 0;
    for (const linkPath of symlinks) {
      let resolved;
      try {
        resolved = fs.realpathSync(linkPath);
      } catch {
        console.warn('[AfterPack] Removing broken symlink:', linkPath);
        try {
          fs.unlinkSync(linkPath);
        } catch {}
        changed += 1;
        continue;
      }
      if (resolved === appReal || resolved.startsWith(appPrefix)) {
        continue;
      }

      const rawTarget = fs.readlinkSync(linkPath);
      const sourceAbs = path.isAbsolute(rawTarget)
        ? rawTarget
        : path.resolve(path.dirname(linkPath), rawTarget);

      let stats;
      try {
        stats = fs.statSync(sourceAbs);
      } catch (e) {
        console.warn('[AfterPack] Skipping unreadable symlink:', linkPath, e.message);
        continue;
      }

      try {
        fs.unlinkSync(linkPath);
        if (stats.isDirectory()) {
          fs.cpSync(sourceAbs, linkPath, { recursive: true, dereference: true });
        } else {
          fs.copyFileSync(sourceAbs, linkPath);
        }
        console.log('[AfterPack] Materialized symlink for codesign:', linkPath);
        changed += 1;
      } catch (e) {
        console.warn('[AfterPack] Failed to materialize symlink:', linkPath, e.message);
      }
    }

    if (changed === 0) {
      break;
    }
    console.log(`[AfterPack] Symlink sanitization pass ${pass + 1}: fixed ${changed} item(s)`);
  }
}

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName } = context;

  console.log('[AfterPack] Running after-pack hook...');
  console.log('[AfterPack] Platform:', electronPlatformName);
  console.log('[AfterPack] Output directory:', appOutDir);

  // Determine the resources path based on platform
  let resourcesPath;
  if (electronPlatformName === 'darwin') {
    resourcesPath = path.join(appOutDir, 'Dome.app', 'Contents', 'Resources');
  } else if (electronPlatformName === 'win32') {
    resourcesPath = path.join(appOutDir, 'resources');
  } else {
    resourcesPath = path.join(appOutDir, 'resources');
  }

  console.log('[AfterPack] Resources path:', resourcesPath);

  // Check if app.asar.unpacked exists
  const asarUnpackedPath = path.join(resourcesPath, 'app.asar.unpacked');
  if (fs.existsSync(asarUnpackedPath)) {
    console.log('[AfterPack] ✅ app.asar.unpacked exists');

    // Verify critical native modules
    const criticalModules = [
      'node_modules/better-sqlite3',
      'node_modules/sharp',
    ];

    for (const modulePath of criticalModules) {
      const fullPath = path.join(asarUnpackedPath, modulePath);
      if (fs.existsSync(fullPath)) {
        console.log(`[AfterPack] ✅ ${modulePath} is unpacked`);

        // Check for .node files
        const nodeFiles = findNodeFiles(fullPath);
        if (nodeFiles.length > 0) {
          console.log(`[AfterPack]    Found ${nodeFiles.length} .node files:`);
          nodeFiles.forEach(file => {
            console.log(`[AfterPack]      - ${path.relative(fullPath, file)}`);
          });
        }
      } else {
        console.warn(`[AfterPack] ⚠️  ${modulePath} is NOT unpacked - this may cause errors!`);
      }
    }
  } else {
    console.error('[AfterPack] ❌ app.asar.unpacked does NOT exist!');
    console.error('[AfterPack] Native modules will not work in production!');
  }

  const pageIndexRuntimePath = path.join(resourcesPath, 'pageindex-runtime');
  if (fs.existsSync(pageIndexRuntimePath)) {
    console.log('[AfterPack] ✅ Embedded PageIndex runtime exists');
    const runtimeTargets = fs.readdirSync(pageIndexRuntimePath).filter(name => !name.startsWith('.'));
    runtimeTargets.forEach((target) => {
      console.log(`[AfterPack]    Runtime target: ${target}`);
    });
  } else {
    console.warn('[AfterPack] ⚠️  Embedded PageIndex runtime missing from resources');
  }

  if (electronPlatformName === 'darwin') {
    const appBundle = path.join(appOutDir, 'Dome.app');
    const scanDirs = [
      path.join(resourcesPath, 'pageindex-runtime'),
      path.join(resourcesPath, 'app.asar.unpacked'),
    ].filter((p) => fs.existsSync(p));
    if (scanDirs.length > 0) {
      console.log('[AfterPack] Checking symlinks for macOS codesign (strict)...');
      fixSymlinksOutsideAppBundle(appBundle, scanDirs);
    }
  }

  console.log('[AfterPack] After-pack hook completed');
};

/**
 * Recursively find all .node files in a directory
 */
function findNodeFiles(dir) {
  const nodeFiles = [];

  function walk(currentPath) {
    if (!fs.existsSync(currentPath)) return;

    const items = fs.readdirSync(currentPath);
    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (item.endsWith('.node')) {
        nodeFiles.push(fullPath);
      }
    }
  }

  walk(dir);
  return nodeFiles;
}
