'use strict';

/* eslint-disable no-console */

/**
 * Social OAuth — loopback for LinkedIn / X; Instagram bounces through a
 * public HTTPS page on dome.dowi.es (Meta rejects http://localhost in Live).
 *
 * Local listener is always HTTP on 127.0.0.1:<port>/callback/<provider>.
 * Instagram authorize + token exchange use INSTAGRAM_PUBLIC_REDIRECT_URI.
 * The landing page forwards ?code&state to the loopback server.
 *
 * Paste-token remains available in Settings for Instagram.
 */

const http = require('node:http');
const crypto = require('node:crypto');
const { shell } = require('electron');

const FLOW_TIMEOUT_MS = 5 * 60 * 1000;
const BOUNCE_PROBE_MS = 8000;
const DEFAULT_OAUTH_PORT = 8737;

const INSTAGRAM_PUBLIC_REDIRECT_URI = 'https://dome.dowi.es/oauth/instagram/callback';
/** Parent Facebook app — not valid as Instagram Login client_id. */
const DOME_FACEBOOK_APP_ID = '1310519154571859';
/** Instagram product App ID (Dome-IG) used by Business Login for Instagram. */
const DOME_INSTAGRAM_APP_ID = '1402064921780132';

const LINKEDIN_BASE_SCOPES = 'openid profile w_member_social';
const LINKEDIN_CMA_SCOPES =
  'r_basicprofile r_1st_connections_size r_member_profileAnalytics r_member_postAnalytics ' +
  'w_organization_social r_organization_social rw_organization_admin';

const IG_BASE_SCOPES =
  'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights';
const IG_COMMENTS_SCOPE = 'instagram_business_manage_comments';
const IG_MESSAGES_SCOPE = 'instagram_business_manage_messages';

const X_BASE_SCOPES = 'tweet.read tweet.write users.read media.write offline.access';
const X_DM_SCOPES = 'dm.read dm.write';

function instagramScopes(store) {
  let scopes = IG_BASE_SCOPES;
  if (store?.getMessagingCommentsEnabled?.('instagram') === true) {
    scopes += `,${IG_COMMENTS_SCOPE}`;
  }
  if (store?.getMessagingDmEnabled?.('instagram') === true) {
    scopes += `,${IG_MESSAGES_SCOPE}`;
  }
  return scopes;
}

function xScopes(store) {
  let scopes = X_BASE_SCOPES;
  if (store?.getMessagingDmEnabled?.('x') === true) {
    scopes += ` ${X_DM_SCOPES}`;
  }
  return scopes;
}

const AUTH_ENDPOINTS = {
  linkedin: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: (store) => (store?.getLinkedInOrgEnabled?.()
      ? `${LINKEDIN_BASE_SCOPES} ${LINKEDIN_CMA_SCOPES}`
      : LINKEDIN_BASE_SCOPES),
    pkce: false,
  },
  instagram: {
    authUrl: 'https://www.instagram.com/oauth/authorize',
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    scopes: (store) => instagramScopes(store),
    pkce: false,
  },
  x: {
    authUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    scopes: (store) => xScopes(store),
    pkce: true,
  },
};

function loopbackRedirectUri(provider, port) {
  return `http://localhost:${port}/callback/${provider}`;
}

function registeredRedirectUri(provider, port) {
  if (provider === 'instagram') return INSTAGRAM_PUBLIC_REDIRECT_URI;
  return loopbackRedirectUri(provider, port);
}

function sanitizeOauthCode(code) {
  if (typeof code !== 'string' || !code) return code;
  return code.trim().replace(/(?:%23|#)_+$/i, '').replace(/(?:%23|#)$/i, '');
}

function instagramCodeExchangeFields({ clientId, clientSecret, redirectUri, code }) {
  return {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  };
}

function looksLikeInstagramTokenPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.access_token === 'string' && payload.access_token.trim()) return true;
  const row = Array.isArray(payload.data) ? payload.data[0] : null;
  return Boolean(row && typeof row === 'object' && typeof row.access_token === 'string' && row.access_token.trim());
}

async function postOAuthFields(url, fields, multipart) {
    if (multipart) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null) form.append(k, String(v));
    }
    return fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(BOUNCE_PROBE_MS * 3) });
  }
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) body.set(k, String(v));
  }
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(BOUNCE_PROBE_MS * 3),
  });
}

const INSTAGRAM_CODE_EXCHANGE_URLS = [
  'https://api.instagram.com/oauth/access_token',
  'https://graph.instagram.com/oauth/access_token',
];

async function exchangeInstagramAuthorizationCode({ clientId, clientSecret, redirectUri, code }) {
  const fields = instagramCodeExchangeFields({ clientId, clientSecret, redirectUri, code });
  let lastErr;
  for (const url of INSTAGRAM_CODE_EXCHANGE_URLS) {
    for (const multipart of [true, false]) {
      try {
        const res = await postOAuthFields(url, fields, multipart);
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
        if (res.ok && looksLikeInstagramTokenPayload(data)) {
          console.warn('[SocialOAuth] Instagram code exchange ok', {
            host: new URL(url).host,
            encoding: multipart ? 'multipart' : 'urlencoded',
          });
          return data;
        }
        lastErr = new Error(`instagram token exchange failed: ${res.status} ${text.slice(0, 500)}`);
      } catch (err) {
        lastErr = err;
      }
    }
  }
  throw lastErr || new Error('instagram token exchange failed');
}

function applyInstagramBusinessLoginParams(params) {
  // Business Login for Instagram (Mar 2026): hide Facebook Login on the
  // re-auth screen. The default enable_fb_login=true issues a Facebook-style
  // token that graph.instagram.com rejects as "Unsupported request - method type".
  params.set('force_reauth', 'true');
  params.set('enable_fb_login', '0');
  return params;
}

function assertInstagramOAuthClientId(clientId) {
  const id = String(clientId || '').trim();
  if (id === DOME_FACEBOOK_APP_ID) {
    throw new Error(
      `Instagram OAuth needs the Instagram App ID (${DOME_INSTAGRAM_APP_ID}), not the Facebook App ID of Dome IA. Copy it from App Dashboard → Instagram → API setup with Instagram login → Business login settings.`,
    );
  }
}

function buildAuthUrl(provider, clientId, port, state, codeChallenge, scope) {
  const ep = AUTH_ENDPOINTS[provider];
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: registeredRedirectUri(provider, port),
    state,
    scope,
  });
  if (ep.pkce && codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }
  if (provider === 'instagram') applyInstagramBusinessLoginParams(params);
  return `${ep.authUrl}?${params.toString()}`;
}

function encodeSocialOAuthState(nonce, port) {
  return Buffer.from(JSON.stringify({ n: nonce, p: port }), 'utf8').toString('base64url');
}

function decodeSocialOAuthState(state) {
  if (typeof state !== 'string' || !state) return { nonce: '', port: DEFAULT_OAUTH_PORT };
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    if (parsed && typeof parsed.n === 'string' && parsed.n.length > 0) {
      const port = Number(parsed.p);
      const safePort = Number.isInteger(port) && port >= 1025 && port <= 65535
        ? port
        : DEFAULT_OAUTH_PORT;
      return { nonce: parsed.n, port: safePort };
    }
  } catch {
    /* legacy: state was a raw nonce */
  }
  return { nonce: state, port: DEFAULT_OAUTH_PORT };
}

async function assertPublicRedirectReachable(url, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(BOUNCE_PROBE_MS),
    });
  } catch (err) {
    throw new Error(
      `Instagram callback page is not reachable at ${url}. Deploy landing-page-dome oauth routes, then retry. (${err.message || err})`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `Instagram callback page returned ${res.status} at ${url}. Wait for dome.dowi.es to finish deploying /oauth/instagram/callback, then retry.`,
    );
  }
}

function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

function htmlPage(title, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fbfbfe;color:#040316}
.card{max-width:420px;padding:32px;border:1px solid #dcdce8;border-radius:12px;background:#f2f2f9;text-align:center}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#4a4766;margin:0}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

function createSocialOAuth(store) {
  let _pending = null; // { provider, state, codeVerifier, resolve, reject, server, timer }

  function redirectUri(provider, port) {
    return registeredRedirectUri(provider, port);
  }

  function cleanup() {
    if (!_pending) return;
    clearTimeout(_pending.timer);
    try {
      _pending.server.close();
    } catch { /* already closed */ }
    _pending = null;
  }

  async function exchangeCode(provider, code, port, codeVerifier) {
    const ep = AUTH_ENDPOINTS[provider];
    const { clientId, clientSecret } = store.getProviderConfig(provider);
    if (provider === 'instagram') {
      return exchangeInstagramAuthorizationCode({
        clientId,
        clientSecret,
        redirectUri: registeredRedirectUri(provider, port),
        code,
      });
    }
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: registeredRedirectUri(provider, port),
      client_id: clientId,
    });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (ep.pkce && codeVerifier) body.set('code_verifier', codeVerifier);
    if (provider === 'x' && clientSecret) {
      headers.Authorization = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    } else if (clientSecret) {
      body.set('client_secret', clientSecret);
    }
    const res = await fetch(ep.tokenUrl, { method: 'POST', headers, body: body.toString() });
    const text = await res.text();
    if (!res.ok) throw new Error(`${provider} token exchange failed: ${res.status} ${text.slice(0, 500)}`);
    return JSON.parse(text);
  }

  function startConnect(provider, finalizeAccount) {
    return new Promise((resolve, reject) => {
      const ep = AUTH_ENDPOINTS[provider];
      if (!ep) {
        reject(new Error(`Unknown social provider: ${provider}`));
        return;
      }
      const { clientId, clientSecret } = store.getProviderConfig(provider);
      if (!clientId) {
        reject(new Error(`social:${provider}: client id not configured. Add it in Settings → Social.`));
        return;
      }
      if (!ep.pkce && !clientSecret) {
        reject(new Error(`social:${provider}: client secret not configured. Add it in Settings → Social.`));
        return;
      }
      if (provider === 'instagram') {
        try {
          assertInstagramOAuthClientId(clientId);
        } catch (err) {
          reject(err);
          return;
        }
      }
      if (_pending) {
        reject(new Error('Another social connection is already in progress.'));
        return;
      }

      const port = store.getOAuthPort();
      const nonce = crypto.randomBytes(16).toString('base64url');
      const state = provider === 'instagram'
        ? encodeSocialOAuthState(nonce, port)
        : nonce;
      const { codeVerifier, codeChallenge } = ep.pkce ? generatePKCE() : {};
      let consumed = false;

      const server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url, `http://127.0.0.1:${port}`);
          if (!url.pathname.startsWith('/callback/')) {
            res.writeHead(404).end();
            return;
          }
          const cbProvider = url.pathname.split('/')[2];
          const error = url.searchParams.get('error');
          const code = sanitizeOauthCode(url.searchParams.get('code'));
          const gotState = url.searchParams.get('state');

          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(htmlPage('Connection cancelled', url.searchParams.get('error_description') || error));
            finish(new Error(`OAuth denied: ${error}`));
            return;
          }
          if (!code || cbProvider !== provider || gotState !== state) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(htmlPage('Invalid callback', 'State mismatch — please retry from Dome.'));
            return;
          }
          if (consumed) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(htmlPage('Connecting…', 'Already processing — you can close this tab and return to Dome.'));
            return;
          }
          consumed = true;

          const tokenData = await exchangeCode(provider, code, port, codeVerifier);
          const account = await finalizeAccount(provider, tokenData);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(htmlPage('Connected to Dome', 'You can close this tab and return to Dome.'));
          finish(null, account);
        } catch (err) {
          console.error('[SocialOAuth] callback error:', err);
          try {
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(htmlPage('Connection failed', String(err.message || err)));
          } catch { /* response already sent */ }
          finish(err);
        }
      });

      function finish(err, account) {
        const pending = _pending;
        cleanup();
        if (!pending) return;
        if (err) pending.reject(err);
        else pending.resolve(account);
      }

      server.on('error', (err) => {
        const msg = err.code === 'EADDRINUSE'
          ? `Port ${port} is busy. Change the OAuth port in Settings → Social.`
          : String(err.message || err);
        finish(new Error(msg));
      });

      const listenAndOpen = () => {
        server.listen(port, '127.0.0.1', () => {
          const timer = setTimeout(() => finish(new Error('OAuth flow timed out (5 min).')), FLOW_TIMEOUT_MS);
          _pending = { provider, state, codeVerifier, resolve, reject, server, timer };
          const scope = typeof ep.scopes === 'function' ? ep.scopes(store) : ep.scopes;
          const authUrl = buildAuthUrl(provider, clientId, port, state, codeChallenge, scope);
          shell.openExternal(authUrl).catch((err) => finish(err));
        });
      };

      if (provider !== 'instagram') {
        listenAndOpen();
        return;
      }

      assertPublicRedirectReachable(INSTAGRAM_PUBLIC_REDIRECT_URI).then(listenAndOpen).catch((err) => {
        try { server.close(); } catch { /* not listening */ }
        reject(err);
      });
    });
  }

  function cancelPending() {
    if (!_pending) return false;
    const pending = _pending;
    cleanup();
    pending.reject(new Error('OAuth flow cancelled.'));
    return true;
  }

  return { startConnect, cancelPending, redirectUri };
}

module.exports = {
  createSocialOAuth,
  AUTH_ENDPOINTS,
  instagramScopes,
  xScopes,
  INSTAGRAM_PUBLIC_REDIRECT_URI,
  DOME_FACEBOOK_APP_ID,
  DOME_INSTAGRAM_APP_ID,
  registeredRedirectUri,
  encodeSocialOAuthState,
  decodeSocialOAuthState,
  assertPublicRedirectReachable,
  sanitizeOauthCode,
  applyInstagramBusinessLoginParams,
  assertInstagramOAuthClientId,
  buildAuthUrl,
  instagramCodeExchangeFields,
  looksLikeInstagramTokenPayload,
  INSTAGRAM_CODE_EXCHANGE_URLS,
};
