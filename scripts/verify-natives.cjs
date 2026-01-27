#!/usr/bin/env node
/**
 * Verify native modules are correctly compiled for Electron
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NATIVE_MODULES = [
  {
    name: 'better-sqlite3',
    path: 'node_modules/better-sqlite3/build/Release/better_sqlite3.node'
  },
  {
    name: 'sharp',
    paths: [
      'node_modules/sharp/build/Release/sharp-darwin-arm64v8.node',
      'node_modules/sharp/build/Release/sharp-darwin-x64.node',
      'node_modules/@img/sharp-darwin-arm64/lib/sharp-darwin-arm64.node',
      'node_modules/@img/sharp-darwin-x64/lib/sharp-darwin-x64.node'
    ]
  }
];

console.log('🔍 Verificando módulos nativos...\n');

let allGood = true;

for (const module of NATIVE_MODULES) {
  console.log(`📦 ${module.name}:`);

  const pathsToCheck = module.paths || [module.path];
  let foundAny = false;

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
    }
  }

  if (!foundAny) {
    console.log(`  ❌ No .node file found! Module may not work.`);
    console.log(`     Expected one of:`);
    pathsToCheck.forEach(p => console.log(`       - ${p}`));
    allGood = false;
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

if (allGood) {
  console.log('✅ All native modules appear to be correctly compiled!\n');
  process.exit(0);
} else {
  console.log('❌ Some native modules are missing or incorrect.');
  console.log('   Run: bun install && bun run rebuild:natives\n');
  process.exit(1);
}
