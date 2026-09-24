'use strict';

/**
 * Native (in-app) email/password login & signup for the onboarding "account gate".
 * Flow: POST /api/auth/password on dome-provider → persistSession
 * (electron/auth/dome-oauth.cjs), so every existing fetchWithDomeAuth consumer
 * (Domain Sync, plan-gate, cloud-sync, …) keeps working unchanged.
 *
 * The renderer never talks to Supabase directly — all HTTP happens here in the
 * main process; the IPC handler only exchanges { email, password, isRegister, name? }
 * for a { success, connected, userId, name, email, hadRemoteData, pendingConfirmation, error, errorCode }.
 */

const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const { persistSession, getRemoteProfile } = require('./dome-oauth.cjs');
const { resolveDomeUserId } = require('./dome-session-identity.cjs');

class SupabaseAuthError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

async function providerPassword({ email, password, isRegister, name }) {
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  let response;
  try {
    response = await fetch(`${base}/api/auth/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        name,
        isRegister,
        client_id: 'dome-desktop',
      }),
    });
  } catch (err) {
    throw new SupabaseAuthError('network_error', err?.message || 'No se pudo conectar con Dome');
  }
  const data = await response.json().catch(() => ({}));
  if (data.pendingConfirmation) return { pendingConfirmation: true };
  if (!response.ok) {
    if (data.error === 'email_taken') {
      throw new SupabaseAuthError('email_taken', 'Ese correo ya tiene una cuenta');
    }
    if (data.error === 'invalid_credentials') {
      throw new SupabaseAuthError('invalid_credentials', 'Email o contraseña incorrectos');
    }
    throw new SupabaseAuthError(data.error || 'auth_failed', 'Fallo de autenticación');
  }
  return data;
}

/**
 * @param {object} database
 * @param {{ email: string, password: string, isRegister: boolean, name?: string, windowManager?: object }} params
 */
async function loginOrRegister(database, { email, password, isRegister, name, windowManager }) {
  const domeSession = await providerPassword({ email, password, isRegister, name });

  if (domeSession.pendingConfirmation) {
    return { success: true, pendingConfirmation: true };
  }
  const userId = resolveDomeUserId(domeSession);
  const now = Date.now();
  const expiresAt = now + Number(domeSession.expires_in || 3600) * 1000;

  persistSession(
    database.getQueries(),
    userId,
    domeSession.access_token,
    domeSession.refresh_token || null,
    expiresAt,
  );

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
