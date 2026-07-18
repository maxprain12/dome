'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Resolved Supabase Auth credentials for native login/signup (onboarding).
 *
 * Precedence:
 * 1. process.env SUPABASE_* or NEXT_PUBLIC_SUPABASE_* (dev / overrides)
 * 2. electron/app-credentials.cjs SUPABASE_URL / SUPABASE_ANON_KEY (CI embed-env)
 * 3. Dev only: sibling dome-provider/.env.local or .env (same keys as dome-provider)
 *
 * No hardcoded production fallback — if unset, callers surface "not configured".
 * The anon key is public by design (shipped in dome-provider's web bundle).
 */
function parseDotEnv(content) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of String(content).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) out[key] = val;
  }
  return out;
}

function pickSupabaseFromRecord(record) {
  const url = (record.SUPABASE_URL || record.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = (record.SUPABASE_ANON_KEY || record.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (url && anonKey) return { url, anonKey };
  return null;
}

function resolveFromProcessEnv() {
  return pickSupabaseFromRecord(process.env);
}

function resolveFromAppCredentials() {
  try {
    const creds = require('../app-credentials.cjs');
    return pickSupabaseFromRecord(creds);
  } catch (_) {
    return null;
  }
}

function isPackagedApp() {
  try {
    const { app } = require('electron');
    return Boolean(app?.isPackaged);
  } catch (_) {
    return false;
  }
}

function resolveFromSiblingProviderEnv() {
  if (isPackagedApp()) return null;

  const candidates = [
    path.join(__dirname, '../../../dome-provider/.env.local'),
    path.join(__dirname, '../../../dome-provider/.env'),
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = parseDotEnv(fs.readFileSync(filePath, 'utf-8'));
      const creds = pickSupabaseFromRecord(parsed);
      if (creds) return creds;
    } catch (_) {
      // ignore unreadable sibling env
    }
  }

  return null;
}

function getSupabaseCredentials() {
  return (
    resolveFromProcessEnv() ||
    resolveFromAppCredentials() ||
    resolveFromSiblingProviderEnv() ||
    { url: '', anonKey: '' }
  );
}

module.exports = {
  getSupabaseCredentials,
  parseDotEnv,
  pickSupabaseFromRecord,
};
