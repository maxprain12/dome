'use strict';

/**
 * Resolved Supabase Auth credentials for native login/signup (onboarding).
 *
 * Precedence:
 * 1. process.env.SUPABASE_URL / SUPABASE_ANON_KEY (dev / overrides)
 * 2. electron/app-credentials.cjs SUPABASE_URL / SUPABASE_ANON_KEY (CI embed-env)
 *
 * No hardcoded production fallback (unlike getDomeProviderBaseUrl()) — if unset,
 * callers must surface a clear "not configured" error instead of hitting an
 * empty URL. Both values are public (the anon key is designed to be shipped
 * client-side; dome-provider's own web bundle already embeds it), so baking
 * them here is not a secrets-handling concern.
 */
function getSupabaseCredentials() {
  const envUrl = (process.env.SUPABASE_URL || '').trim();
  const envKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey };

  try {
    const creds = require('../app-credentials.cjs');
    const url = (creds.SUPABASE_URL || '').trim();
    const anonKey = (creds.SUPABASE_ANON_KEY || '').trim();
    if (url && anonKey) return { url, anonKey };
  } catch (_) {
    // app-credentials.cjs absent (dev without embed-env)
  }

  return { url: '', anonKey: '' };
}

module.exports = { getSupabaseCredentials };
