#!/usr/bin/env node
/**
 * Phase 0 spike: verify Drizzle wraps better-sqlite3 and matches raw queries.
 * Usage: node scripts/drizzle-spike.mjs [path-to-dome.db]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const dbPath =
  process.argv[2] ||
  path.join(process.env.APPDATA || '', 'dome', 'dome.db');

if (!fs.existsSync(dbPath)) {
  console.error('[drizzle-spike] DB not found:', dbPath);
  console.error('Pass a path or ensure Dome userData exists.');
  process.exit(1);
}

let createDrizzle;
let settingsRepo;
let tagsRepo;
try {
  ({ createDrizzle, settingsRepo, tagsRepo } = require('@dome/db'));
} catch (err) {
  console.error('[drizzle-spike] @dome/db not built. Run: pnpm run build:packages');
  console.error(err?.message || err);
  process.exit(1);
}

const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
const orm = createDrizzle(sqlite);

const rawVersion = sqlite.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get();
const drizzleVersion = settingsRepo.getSetting(orm, 'schema_version');

const rawTags = sqlite.prepare('SELECT COUNT(*) AS c FROM tags').get();
const drizzleTags = tagsRepo.getAllTagsWithCount(orm);

console.log('=== Drizzle spike ===');
console.log('db:', dbPath);
console.log('schema_version raw:', rawVersion?.value ?? null);
console.log('schema_version drizzle:', drizzleVersion ?? null);
console.log('tags count raw:', rawTags?.c ?? 0);
console.log('tags count drizzle:', drizzleTags.length);

const ok =
  String(rawVersion?.value ?? '') === String(drizzleVersion ?? '') &&
  Number(rawTags?.c ?? 0) === drizzleTags.length;

console.log('match:', ok ? 'PASS' : 'FAIL');
sqlite.close();
process.exit(ok ? 0 : 1);
