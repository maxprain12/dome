'use strict';

/* eslint-disable no-console */

/**
 * Social OAuth — loopback flow for LinkedIn / Instagram / X.
 *
 * All three platforms reject custom schemes like dome:// but accept
 * http://localhost redirects (LinkedIn and X always; Meta while the app is in
 * development mode), so we spin a short-lived HTTP server on 127.0.0.1 and
 * open the system browser. Redirect URI to register in each developer app:
 *   http://localhost:<port>/callback/<provider>   (default port 8737)
 *
 * Providers that make OAuth painful (Instagram) can instead be connected by
 * pasting an access token in Settings → handled by the provider modules.
 */

const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');

const FLOW_TIMEOUT_MS = 5 * 60 * 1000;

// LinkedIn Community Management API scopes are opt-in (Settings → Social →
// LinkedIn → company pages). Without that product, LinkedIn rejects the
// authorization if these scopes are requested.
// Includes member analytics (followers / post stats / connection count) plus
// organization page management. Listing historical personal posts still needs
// r_member_social, which LinkedIn keeps closed — we do not request it.
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
  if (store?.getMessagingCommentsEnabled?.('instagram') !== false) {
    scopes += `,${IG_COMMENTS_SCOPE}`;
  }
  if (store?.getMessagingDmEnabled?.('instagram') !== false) {
    scopes += `,${IG_MESSAGES_SCOPE}`;
  }
  return scopes;
}

function xScopes(store) {
  let scopes = X_BASE_SCOPES;
  if (store?.getMessagingDmEnabled?.('x') !== false) {
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
    return `http://localhost:${port}/callback/${provider}`;
  }

  function cleanup() {
    if (!_pending) return;
    clearTimeout(_pending.timer);
    try {
      _pending.server.close();
    } catch { /* already closed */ }
    _pending = null;
  }

  function buildAuthUrl(provider, clientId, port, state, codeChallenge) {
    const ep = AUTH_ENDPOINTS[provider];
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri(provider, port),
      state,
      scope: typeof ep.scopes === 'function' ? ep.scopes(store) : ep.scopes,
    });
    if (ep.pkce && codeChallenge) {
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }
    if (provider === 'instagram') params.set('force_reauth', 'true');
    return `${ep.authUrl}?${params.toString()}`;
  }

  async function exchangeCode(provider, code, port, codeVerifier) {
    const ep = AUTH_ENDPOINTS[provider];
    const { clientId, clientSecret } = store.getProviderConfig(provider);
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(provider, port),
      client_id: clientId,
    });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (ep.pkce && codeVerifier) body.set('code_verifier', codeVerifier);
    if (provider === 'x' && clientSecret) {
      // Confidential X clients authenticate with Basic auth instead of body params.
      headers.Authorization = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    } else if (clientSecret) {
      body.set('client_secret', clientSecret);
    }
    const res = await fetch(ep.tokenUrl, { method: 'POST', headers, body: body.toString() });
    const text = await res.text();
    if (!res.ok) throw new Error(`${provider} token exchange failed: ${res.status} ${text.slice(0, 500)}`);
    return JSON.parse(text);
  }

  /**
   * Start OAuth for a provider. Resolves with the created account (renderer-safe).
   * `finalizeAccount(provider, tokenData)` comes from the provider registry and
   * turns raw token data into a stored social_accounts row.
   */
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
      if (_pending) {
        reject(new Error('Another social connection is already in progress.'));
        return;
      }

      const port = store.getOAuthPort();
      const state = crypto.randomBytes(16).toString('base64url');
      const { codeVerifier, codeChallenge } = ep.pkce ? generatePKCE() : {};
      // Browsers sometimes hit the callback URL twice (prefetch / duplicate GET).
      // Exchanging the same authorization code twice makes the provider revoke
      // the token issued to the first exchange (OAuth code-reuse protection,
      // seen as LinkedIn REVOKED_ACCESS_TOKEN) — so only the FIRST valid
      // request may run the exchange.
      let consumed = false;

      const server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url, `http://localhost:${port}`);
          if (!url.pathname.startsWith('/callback/')) {
            res.writeHead(404).end();
            return;
          }
          const cbProvider = url.pathname.split('/')[2];
          const error = url.searchParams.get('error');
          const code = url.searchParams.get('code');
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
            // Duplicate delivery of the same code: acknowledge without exchanging.
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

      server.listen(port, '127.0.0.1', () => {
        const timer = setTimeout(() => finish(new Error('OAuth flow timed out (5 min).')), FLOW_TIMEOUT_MS);
        _pending = { provider, state, codeVerifier, resolve, reject, server, timer };
        const authUrl = buildAuthUrl(provider, clientId, port, state, codeChallenge);
        void shell.openExternal(authUrl);
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

module.exports = { createSocialOAuth, AUTH_ENDPOINTS };
