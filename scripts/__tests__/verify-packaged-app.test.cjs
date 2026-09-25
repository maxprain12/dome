'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  archName,
  findArchMismatches,
  findUnresolvedDependencies,
  packageDirOf,
} = require('../verify-packaged-app.cjs');

function scan(packages) {
  const files = [];
  const json = new Map();
  for (const [pkgJsonPath, pkg] of Object.entries(packages)) {
    files.push(pkgJsonPath);
    json.set(pkgJsonPath, pkg);
  }
  return findUnresolvedDependencies(files, (file) => json.get(file) ?? null);
}

test('packageDirOf only accepts package roots', () => {
  assert.equal(packageDirOf('/package.json'), '');
  assert.equal(packageDirOf('/node_modules/once/package.json'), '/node_modules/once');
  assert.equal(packageDirOf('/node_modules/@img/sharp/package.json'), '/node_modules/@img/sharp');
  assert.equal(packageDirOf('/node_modules/a/node_modules/b/package.json'), '/node_modules/a/node_modules/b');
  assert.equal(packageDirOf('/node_modules/uuid/dist/esm/package.json'), null);
  assert.equal(packageDirOf('/electron/package.json'), null);
});

test('reports a dependency that is missing from the archive (Dome 2.9.1: once)', () => {
  const missing = scan({
    '/package.json': { dependencies: { exceljs: '^4' } },
    '/node_modules/exceljs/package.json': { dependencies: { inflight: '^1' } },
    '/node_modules/inflight/package.json': { dependencies: { once: '^1', wrappy: '1' } },
    '/node_modules/wrappy/package.json': {},
  });
  assert.deepEqual(missing, [{ dependent: '/node_modules/inflight', dependency: 'once' }]);
});

test('resolves nested and hoisted dependencies like Node does', () => {
  const missing = scan({
    '/package.json': { dependencies: { a: '1' } },
    '/node_modules/a/package.json': { dependencies: { b: '1', shared: '1' } },
    '/node_modules/a/node_modules/b/package.json': { dependencies: { shared: '1', c: '1' } },
    '/node_modules/a/node_modules/c/package.json': {},
    '/node_modules/shared/package.json': {},
  });
  assert.deepEqual(missing, []);
});

test('ignores optional dependencies and reports missing root deps', () => {
  const missing = scan({
    '/package.json': { dependencies: { gone: '1' } },
    '/node_modules/sharp/package.json': {
      dependencies: { '@img/sharp-linuxmusl-x64': '1' },
      optionalDependencies: { '@img/sharp-linuxmusl-x64': '1' },
    },
  });
  assert.deepEqual(missing, [{ dependent: '/', dependency: 'gone' }]);
});

test('archName maps electron-builder Arch enum values', () => {
  assert.equal(archName(1), 'x64');
  assert.equal(archName(3), 'arm64');
  assert.equal(archName('arm64'), 'arm64');
});

test('flags host-arch prebuilts in a cross-arch build', () => {
  const unpacked = ['@img/sharp-darwin-arm64', '@lancedb/lancedb', '@lancedb/lancedb-darwin-arm64', 'better-sqlite3'];
  assert.deepEqual(findArchMismatches(unpacked, 'darwin', 1), [
    { family: '@img/sharp-', expected: '@img/sharp-darwin-x64', found: ['@img/sharp-darwin-arm64'] },
    { family: '@lancedb/lancedb-', expected: '@lancedb/lancedb-darwin-x64', found: ['@lancedb/lancedb-darwin-arm64'] },
  ]);
  assert.deepEqual(findArchMismatches(unpacked, 'darwin', 3), []);
});

test('accepts libc-suffixed Linux prebuilts and skips universal builds', () => {
  assert.deepEqual(findArchMismatches(['@napi-rs/canvas-linux-x64-gnu'], 'linux', 'x64'), []);
  assert.deepEqual(findArchMismatches(['@img/sharp-darwin-arm64'], 'darwin', 4), []);
});
