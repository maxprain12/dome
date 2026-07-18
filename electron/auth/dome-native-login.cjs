'use strict';

/**
 * Native (in-app) email/password login & signup for the onboarding "account gate".
 * Flow: Supabase Auth (password grant / signup) → dome-provider's
 * /api/auth/supabase-exchange (mints Dome OAuth-shaped tokens) → persistSession
 * (electron/auth/dome-oauth.cjs), so every existing fetchWithDomeAuth consumer
 * (Domain Sync, plan-gate, cloud-sync, …) keeps working unchanged.
 *
 * The renderer never talks to Supabase directly — all HTTP happens here in the
 * main process; the IPC handler only exchanges { email, password, isRegister, name? }
 * for a { success, connected, userId, name, email, hadRemoteData, pendingConfirmation, error, errorCode }.
 */

const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const { getSupabaseCredentials } = require('./supabase-credentials.cjs');
const { persistSession, getRemoteProfile } = require('./dome-oauth.cjs');

class SupabaseAuthError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

function mapSupabaseError(status, data) {
  const raw = String(data?.error_description || data?.msg || data?.error || '').toLowerCase();
  if (
    status === 400 &&
    (data?.error === 'invalid_grant' || raw.includes('invalid login credentials'))
  ) {
    return new SupabaseAuthError('invalid_credentials', 'Email o contraseña incorrectos');
  }
  if (
    data?.error_code === 'user_already_exists' ||
    raw.includes('already registered') ||
    raw.includes('already exists')
  ) {
    return new SupabaseAuthError('email_taken', 'Ese correo ya tiene una cuenta');
  }
  if (raw.includes('password') && (raw.includes('short') || raw.includes('weak') || raw.includes('at least'))) {
    return new SupabaseAuthError('weak_password', 'La contraseña es demasiado débil');
  }
  return new SupabaseAuthError(
    'auth_failed',
    data?.error_description || data?.msg || data?.error || 'Fallo de autenticación',
  );
}

async function supabaseFetch(path, body) {
  const { url, anonKey } = getSupabaseCredentials();
  if (!url || !anonKey) {
    throw new SupabaseAuthError('supabase_not_configured', 'Supabase no está configurado');
  }
  let response;
  try {
    response = await fetch(`${url.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new SupabaseAuthError('network_error', err?.message || 'No se pudo conectar con el servidor');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw mapSupabaseError(response.status, data);
  }
  return data;
}

async function supabasePasswordGrant(email, password) {
  return supabaseFetch('/auth/v1/token?grant_type=password', { email, password });
}

async function supabaseSignUp(email, password, name) {
  const body = { email, password };
  if (name?.trim()) {
    body.data = { name: name.trim() };
  }
  const data = await supabaseFetch('/auth/v1/signup', body);
  if (!data.access_token) {
    // Confirmations enabled on the hosted project — no session yet.
    return { pendingConfirmation: true };
  }
  return data;
}

async function exchangeForDomeSession(supabaseAccessToken) {
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  let response;
  try {
    response = await fetch(`${base}/api/auth/supabase-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabase_access_token: supabaseAccessToken, client_id: 'dome-desktop' }),
    });
  } catch (err) {
    throw new SupabaseAuthError('exchange_failed', err?.message || 'No se pudo contactar a Dome Provider');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SupabaseAuthError('exchange_failed', data?.error || `exchange_failed_${response.status}`);
  }
  return data;
}

/**
 * dome-provider's mintAccessToken (lib/oauth-store.ts) produces
 * base64url(JSON).base64url(HMAC) — not a verifiable JWT without
 * TOKEN_HMAC_SECRET, but we trust it: it just arrived over TLS directly from
 * dome-provider in response to our own request.
 */
function extractUserIdFromDomeAccessToken(domeAccessToken) {
  const [encoded] = String(domeAccessToken).split('.');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!payload?.sub) throw new SupabaseAuthError('exchange_failed', 'Token de Dome sin identificador de usuario');
  return payload.sub;
}

/**
 * @param {object} database
 * @param {{ email: string, password: string, isRegister: boolean, name?: string, windowManager?: object }} params
 */
async function loginOrRegister(database, { email, password, isRegister, name, windowManager }) {
  const supabaseResult = isRegister
    ? await supabaseSignUp(email, password, name)
    : await supabasePasswordGrant(email, password);

  if (supabaseResult.pendingConfirmation) {
    return { success: true, pendingConfirmation: true };
  }

  const domeSession = await exchangeForDomeSession(supabaseResult.access_token);
  const userId = extractUserIdFromDomeAccessToken(domeSession.access_token);
  const now = Date.now();
  const expiresAt = now + Number(domeSession.expires_in || 3600) * 1000;

  persistSession(database.getQueries(), userId, domeSession.access_token, domeSession.refresh_token, expiresAt);

  const profile = await getRemoteProfile(database);
  const { runPostLoginBootstrap } = require('../storage/post-login-bootstrap.cjs');
  const bootstrap = await runPostLoginBootstrap({ database, windowManager });

  const onboardingRow = database.getQueries().getSetting.get('onboarding_completed');
  const alreadyOnboarded = !isRegister && onboardingRow?.value === 'true';

  return {
    success: true,
    connected: true,
    userId,
    name: profile.name ?? (name?.trim() || null),
    email: profile.email ?? email.trim(),
    hadRemoteData: Boolean(bootstrap?.hadRemoteData || profile?.name),
    alreadyOnboarded,
  };
}

module.exports = { loginOrRegister };
