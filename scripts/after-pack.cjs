#!/usr/bin/env node
/**
 * After-pack hook for electron-builder
 * Ensures native modules are correctly unpacked and accessible
 */

const fs = require('fs');
const path = require('path');

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
      'node_modules/vectordb',
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
