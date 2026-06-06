/* eslint-disable no-console */
/**
 * MCP OAuth - Flujo PKCE para capturar tokens vía redirect (backlinks)
 *
 * Genera URL de autorización, abre el navegador y captura el token cuando
 * el proveedor redirige a dome://mcp-auth/oauth/callback
 */
const crypto = require('crypto');
const { shell } = require('electron');

const REDIRECT_BASE = 'dome://mcp-auth/oauth/callback';

/**
 * Genera code_verifier y code_challenge para PKCE
 */
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = hash.toString('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Configuración OAuth por proveedor
 * client_id: registrar la app en el proveedor para obtenerlo
 */
const OAUTH_CONFIG = {
  neon: {
    authUrl: 'https://mcp.neon.tech/api/authorize',
    tokenUrl: 'https://mcp.neon.tech/api/token',
    clientId: process.env.DOME_NEON_MCP_CLIENT_ID || '',
    scopes: 'read write *',
    resource: 'https://mcp.neon.tech/',
  },
};

/**
 * Obtiene el client_id configurado para un proveedor
 * Prioridad: env var > database setting
 */
async function getClientId(providerId, database) {
  const config = OAUTH_CONFIG[providerId];
  if (!config) return null;
  if (config.clientId) return config.clientId;
  if (database?.getQueries) {
    const row = database.getQueries().getSetting?.get?.('mcp_oauth_' + providerId + '_client_id');
    return row?.value ?? null;
  }
  return null;
}

/**
 * Construye la URL de autorización OAuth con PKCE
 */
function buildAuthUrl(providerId, codeChallenge, state, clientId) {
  const config = OAUTH_CONFIG[providerId];
  if (!config) throw new Error('Proveedor OAuth no soportado: ' + providerId);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    redirect_uri: REDIRECT_BASE,
    state,
    scope: config.scopes || 'read write',
  });
  if (config.resource) params.set('resource', config.resource);

  return `${config.authUrl}?${params.toString()}`;
}

/**
 * Intercambia el código de autorización por access_token
 */
async function exchangeCodeForToken(providerId, code, codeVerifier, clientId) {
  const config = OAUTH_CONFIG[providerId];
  if (!config) throw new Error('Proveedor OAuth no soportado: ' + providerId);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    client_id: clientId,
    redirect_uri: REDIRECT_BASE,
  });

  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.access_token || data.token;
}

/**
 * Inicia el flujo OAuth: abre el navegador y retorna una Promise que se resuelve
 * cuando llega el callback con el token.
 */
function startOAuthFlow(providerId, database) {
  return new Promise(async (resolve, reject) => {
    const clientId = await getClientId(providerId, database);
    if (!clientId) {
      reject(new Error(
        'Neon OAuth: falta client_id. Configura DOME_NEON_MCP_CLIENT_ID o registra Dome en Neon Partners (neon.tech/partners).'
      ));
      return;
    }

    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = Buffer.from(JSON.stringify({ id: 'user-Neon', providerId, ts: Date.now() })).toString('base64url');

    const authUrl = buildAuthUrl(providerId, codeChallenge, state, clientId);

    const pending = global.__mcpOAuthPending || (global.__mcpOAuthPending = new Map());
    pending.set(providerId, { resolve, reject, codeVerifier, state, clientId });

    shell.openExternal(authUrl);
  });
}

/**
 * Maneja el callback OAuth cuando el usuario es redirigido a dome://...
 */
function handleOAuthCallback(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'dome:' || !parsed.pathname.includes('oauth/callback')) return false;

    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');
    const error = parsed.searchParams.get('error');

    if (error) {
      const pending = global.__mcpOAuthPending;
      if (pending) {
        for (const [, p] of pending) {
          p.reject(new Error('OAuth rechazado: ' + (parsed.searchParams.get('error_description') || error)));
        }
        pending.clear();
      }
      return true;
    }

    if (!code || !state) return false;

    const pending = global.__mcpOAuthPending;
    if (!pending) return false;

    for (const [providerId, p] of pending) {
      if (p.state === state) {
        pending.delete(providerId);
        exchangeCodeForToken(providerId, code, p.codeVerifier, p.clientId)
          .then((token) => p.resolve({ token, providerId }))
          .catch((err) => p.reject(err));
        return true;
      }
    }
  } catch (e) {
    console.warn('[MCP OAuth] Callback error:', e?.message);
  }
  return false;
}

/**
 * Soporta providerId para futuras integraciones (Atlassian, Linear, Slack)
 */
function getSupportedProviders() {
  return Object.keys(OAUTH_CONFIG);
}

module.exports = {
  startOAuthFlow,
  handleOAuthCallback,
  getSupportedProviders,
  getClientId,
  REDIRECT_BASE,
};
