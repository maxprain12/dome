#!/usr/bin/env node
/**
 * Verify native modules are correctly compiled for Electron
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Detect platform
const platform = process.platform;
const arch = process.arch;

console.log(`🖥️  Platform: ${platform}-${arch}\n`);

const NATIVE_MODULES = [
  {
    name: 'better-sqlite3',
    path: 'node_modules/better-sqlite3/build/Release/better_sqlite3.node'
  },
  {
    name: 'sharp',
    paths: getSharpPaths(platform, arch)
  }
];

/**
 * Get platform-specific sharp paths
 */
function getSharpPaths(platform, arch) {
  const paths = [];

  if (platform === 'darwin') {
    // macOS
    if (arch === 'arm64') {
      paths.push(
        'node_modules/sharp/build/Release/sharp-darwin-arm64v8.node',
        'node_modules/@img/sharp-darwin-arm64/lib/sharp-darwin-arm64.node'
      );
    }
    if (arch === 'x64') {
      paths.push(
        'node_modules/sharp/build/Release/sharp-darwin-x64.node',
        'node_modules/@img/sharp-darwin-x64/lib/sharp-darwin-x64.node'
      );
    }
  } else if (platform === 'linux') {
    // Linux
    if (arch === 'x64') {
      paths.push(
        'node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node',
        'node_modules/@img/sharp-linuxmusl-x64/lib/sharp-linuxmusl-x64.node'
      );
    }
    if (arch === 'arm64') {
      paths.push(
        'node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64.node',
        'node_modules/@img/sharp-linuxmusl-arm64/lib/sharp-linuxmusl-arm64.node'
      );
    }
  } else if (platform === 'win32') {
    // Windows
    if (arch === 'x64') {
      paths.push(
        'node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64.node'
      );
    }
    if (arch === 'ia32') {
      paths.push(
        'node_modules/@img/sharp-win32-ia32/lib/sharp-win32-ia32.node'
      );
    }
  }

  return paths;
}

console.log('🔍 Verificando módulos nativos...\n');

let criticalMissing = false;
let warnings = [];

for (const module of NATIVE_MODULES) {
  console.log(`📦 ${module.name}:`);

  const pathsToCheck = module.paths || [module.path];
  let foundAny = false;
  let foundPaths = [];

  for (const modulePath of pathsToCheck) {
    const fullPath = path.join(__dirname, '..', modulePath);

    if (fs.existsSync(fullPath)) {
      console.log(`  ✅ Found: ${modulePath}`);

      // Try to get file info
      try {
        const stats = fs.statSync(fullPath);
        console.log(`     Size: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`     Modified: ${stats.mtime.toISOString()}`);

        // Check if it's linked to the correct architecture
        try {
          const fileOutput = execSync(`file "${fullPath}"`, { encoding: 'utf-8' });
          console.log(`     Type: ${fileOutput.trim()}`);
        } catch (err) {
          // 'file' command might not be available on all systems
        }
      } catch (err) {
        console.log(`     ⚠️  Could not read file info: ${err.message}`);
      }

      foundAny = true;
      foundPaths.push(modulePath);
    }
  }

  if (!foundAny) {
    // Check if this is a critical module
    if (module.name === 'better-sqlite3') {
      console.log(`  ❌ CRITICAL: No .node file found! Module is required.`);
      console.log(`     Expected: ${pathsToCheck[0]}`);
      criticalMissing = true;
    } else {
      console.log(`  ⚠️  No .node file found for ${module.name}.`);
      console.log(`     Expected one of:`);
      pathsToCheck.forEach(p => console.log(`       - ${p}`));
      console.log(`     This may be OK if the module is optional or platform-specific.`);
      warnings.push(module.name);
    }
  }

  console.log('');
}

// Check Electron version
console.log('🔧 Electron version:');
try {
  const electronPath = path.join(__dirname, '..', 'node_modules', 'electron', 'package.json');
  const electronPkg = JSON.parse(fs.readFileSync(electronPath, 'utf-8'));
  console.log(`  Version: ${electronPkg.version}\n`);
} catch (err) {
  console.log(`  ⚠️  Could not determine Electron version\n`);
}

// Check Node ABI version
console.log('🔧 Node ABI version:');
try {
  const abiVersion = process.versions.modules;
  console.log(`  Current process: ${abiVersion}`);
  console.log(`  (This should match Electron's ABI version)\n`);
} catch (err) {
  console.log(`  ⚠️  Could not determine ABI version\n`);
}

// Summary
console.log('═══════════════════════════════════════════════════\n');

if (criticalMissing) {
  console.log('❌ CRITICAL: Required native modules are missing!');
  console.log('   Run: bun install && bun run rebuild:natives\n');
  process.exit(1);
} else if (warnings.length > 0) {
  console.log(`⚠️  Some optional modules have warnings: ${warnings.join(', ')}`);
  console.log('   This may be OK depending on your platform and use case.');
  console.log('✅ All critical modules are present.\n');
  process.exit(0);
} else {
  console.log('✅ All native modules appear to be correctly compiled!\n');
  process.exit(0);
}
