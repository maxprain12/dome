#!/usr/bin/env node
/**
 * Install both @lancedb/vectordb-darwin-arm64 and @lancedb/vectordb-darwin-x64
 * for universal macOS builds. Bun/npm skip platform-mismatched optional deps,
 * so we use npm pack + extract to force-install both.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const nodeModules = path.join(rootDir, 'node_modules');
const lancedbDir = path.join(nodeModules, '@lancedb');

const PACKAGES = [
  '@lancedb/vectordb-darwin-arm64@0.4.20',
  '@lancedb/vectordb-darwin-x64@0.4.20',
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function installPackage(pkgSpec) {
  const pkgName = pkgSpec.replace('@0.4.20', '');
  const targetDir = path.join(lancedbDir, pkgName.replace('@lancedb/', ''));

  if (fs.existsSync(targetDir)) {
    console.log(`  ✓ ${pkgName} already installed`);
    return;
  }

  console.log(`  Installing ${pkgSpec}...`);
  const cwd = rootDir;
  try {
    const packOutput = execSync(`npm pack ${pkgSpec} --silent 2>/dev/null`, {
      cwd,
      encoding: 'utf-8',
    }).trim();
    const tarball = packOutput.split('\n').pop();
    const tarballPath = path.join(cwd, tarball);
    if (fs.existsSync(tarballPath)) {
      ensureDir(path.dirname(targetDir));
      execSync(`tar -xzf "${tarball}" && mv package "${targetDir}"`, {
        cwd,
        shell: true,
        stdio: 'pipe',
      });
      fs.unlinkSync(tarballPath);
      console.log(`  ✓ ${pkgName} installed`);
    }
  } catch (err) {
    console.warn(`  ⚠ Failed to install ${pkgName}:`, err.message);
  }
}

console.log('Installing LanceDB native packages for macOS (arm64 + x64)...\n');
ensureDir(lancedbDir);

for (const pkg of PACKAGES) {
  installPackage(pkg);
}

console.log('\nDone.');
