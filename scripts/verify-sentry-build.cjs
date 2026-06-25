#!/usr/bin/env node
/**
 * CI gate: ensure Sentry DSN is baked into both the main-process credentials
 * file and the Vite renderer bundle before electron-builder runs.
 *
 * Usage: node scripts/verify-sentry-build.cjs
 * Expects: pnpm run build + node scripts/embed-env.cjs already executed.
 */

const fs = require('fs');
const path = require('path');

const credPath = path.join(__dirname, '../electron/app-credentials.cjs');
const distAssetsDir = path.join(__dirname, '../dist/assets');

function fail(message) {
  console.error('[verify-sentry-build] FAIL:', message);
  process.exit(1);
}

function ok(message) {
  console.log('[verify-sentry-build] OK:', message);
}

if (!fs.existsSync(credPath)) {
  fail('electron/app-credentials.cjs missing — run node scripts/embed-env.cjs first');
}

let creds;
try {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  creds = require(credPath);
} catch (err) {
  fail(`could not load app-credentials.cjs: ${err?.message || err}`);
}

const dsn = String(creds.SENTRY_DSN || '').trim();
if (!dsn || dsn.includes('...') || !dsn.startsWith('https://')) {
  fail('SENTRY_DSN empty or invalid in electron/app-credentials.cjs');
}

const hostMatch = dsn.match(/@([^/]+)/);
const ingestHost = hostMatch ? hostMatch[1] : null;
ok(`main SENTRY_DSN set (${ingestHost || 'unknown host'})`);

if (!fs.existsSync(distAssetsDir)) {
  fail('dist/assets/ missing — run pnpm run build first');
}

const jsFiles = fs.readdirSync(distAssetsDir).filter((name) => name.endsWith('.js'));
if (jsFiles.length === 0) {
  fail('no JS bundles found in dist/assets/');
}

const needles = [ingestHost, 'ingest.de.sentry.io', 'ingest.sentry.io'].filter(Boolean);
let foundInDist = false;

for (const file of jsFiles) {
  const content = fs.readFileSync(path.join(distAssetsDir, file), 'utf8');
  if (needles.some((needle) => content.includes(needle))) {
    foundInDist = true;
    break;
  }
}

if (!foundInDist) {
  fail(
    'renderer bundle does not reference Sentry ingest host — VITE_SENTRY_DSN may be missing at build time',
  );
}

ok('renderer bundle contains Sentry ingest host reference');
console.log('[verify-sentry-build] All checks passed');
