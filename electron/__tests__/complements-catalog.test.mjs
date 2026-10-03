import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validateCatalog } from '../../scripts/export-complements-catalog.mjs';
const catalog = JSON.parse(fs.readFileSync(new URL('../../app/lib/marketplace/complements-catalog.json', import.meta.url), 'utf8'));

test('editorial identities, versions and permissions match shipped definitions', () => {
  assert.equal(validateCatalog(catalog), catalog);
  assert.equal(new Set(catalog.items.map((entry) => entry.category)).size, 5);
  assert.equal(catalog.items[0].id, 'dome-cms');
});

test('catalog import rejects version drift, duplicate IDs and permission drift', () => {
  const version = structuredClone(catalog);
  version.items[0].version = '99.0.0';
  assert.throws(() => validateCatalog(version), /Catalog drift/);
  const duplicate = structuredClone(catalog);
  duplicate.items.push(duplicate.items[0]);
  assert.throws(() => validateCatalog(duplicate), /Duplicate/);
  const permissions = structuredClone(catalog);
  permissions.items[0].permissions.push('shell.execute');
  assert.throws(() => validateCatalog(permissions), /Permission drift/);
});
