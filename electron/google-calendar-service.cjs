/* eslint-disable no-console */
/**
 * Google Calendar Service - OAuth + API + Sync
 * Handles Google Calendar OAuth flow, API calls, and incremental sync with local DB.
 */

const crypto = require('crypto');
const { shell } = require('electron');
const database = require('./database.cjs');
const authManager = require('./auth-manager.cjs');

const REDIRECT_URI = 'dome://calendar-oauth/callback';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

let _pendingOAuth = null;

/**
 * Get Google OAuth client ID (from env or settings)
 */
function getClientId() {
  const env = process.env.DOME_GOOGLE_CALENDAR_CLIENT_ID;
  if (env) return env;
  try {
    const row = database.getQueries().getSetting?.get?.('google_calendar_client_id');
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Get Google OAuth client secret (optional for PKCE, required for auth code flow)
 */
function getClientSecret() {
  const env = process.env.DOME_GOOGLE_CALENDAR_CLIENT_SECRET;
  if (env) return env;
  try {
    const row = database.getQueries().getSetting?.get?.('google_calendar_client_secret');
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Generate PKCE code_verifier and code_challenge
 */
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = hash.toString('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Start Google Calendar OAuth flow
 * Opens browser, returns Promise that resolves when callback is received
 */
function startOAuthFlow() {
  return new Promise((resolve, reject) => {
    const clientId = getClientId();
    if (!clientId) {
      reject(new Error('Google Calendar OAuth: client_id not configured. Set DOME_GOOGLE_CALENDAR_CLIENT_ID or google_calendar_client_id in settings.'));
      return;
    }

    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = Buffer.from(JSON.stringify({ ts: Date.now(), nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: GOOGLE_CALENDAR_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
    _pendingOAuth = { resolve, reject, codeVerifier, state };
    shell.openExternal(authUrl);
  });
}

/**
 * Handle OAuth callback from dome://calendar-oauth/callback
 * @returns {boolean} true if this URL was handled
 */
async function handleOAuthCallback(url) {
  try {
    if (!url || !url.startsWith('dome://calendar-oauth/callback')) return false;

    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');
    const error = parsed.searchParams.get('error');

    if (error) {
      if (_pendingOAuth) {
        _pendingOAuth.reject(new Error('OAuth denied: ' + (parsed.searchParams.get('error_description') || error)));
        _pendingOAuth = null;
      }
      return true;
    }

    if (!code || !state || !_pendingOAuth) return false;
    if (_pendingOAuth.state !== state) return false;

    const clientId = getClientId();
    const clientSecret = getClientSecret();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: _pendingOAuth.codeVerifier,
    });
    if (clientSecret) body.set('client_secret', clientSecret);

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      _pendingOAuth.reject(new Error(`Token exchange failed: ${res.status} ${text}`));
      _pendingOAuth = null;
      return true;
    }

    const tokenData = await res.json();
    const { access_token, refresh_token, expires_in } = tokenData;
    if (!access_token) {
      _pendingOAuth.reject(new Error('No access_token in response'));
      _pendingOAuth = null;
      return true;
    }

    const accountId = `google-${Date.now()}`;
    const credentials = JSON.stringify({
      access_token,
      refresh_token: refresh_token || null,
      expires_at: expires_in ? Date.now() + expires_in * 1000 : null,
    });

    const q = database.getQueries();
    const now = Date.now();
    q.createCalendarAccount.run(accountId, 'google', 'pending@google.com', credentials, 'active', null, null, now, now);

    _pendingOAuth.resolve({ accountId, accessToken: access_token });
    _pendingOAuth = null;
    return true;
  } catch (err) {
    console.error('[GoogleCalendar] OAuth callback error:', err);
    if (_pendingOAuth) {
      _pendingOAuth.reject(err);
      _pendingOAuth = null;
    }
    return true;
  }
}

/**
 * Get valid access token for account (refresh if needed)
 */
async function getAccessToken(accountId) {
  const q = database.getQueries();
  const row = q.getCalendarAccountById.get(accountId);
  if (!row || row.provider !== 'google') return null;

  let creds;
  try {
    creds = JSON.parse(row.credentials);
  } catch {
    return null;
  }

  const now = Date.now();
  const expiresAt = creds.expires_at || 0;
  if (expiresAt > now + 60 * 1000) {
    return creds.access_token;
  }

  if (!creds.refresh_token) {
    console.warn('[GoogleCalendar] No refresh_token for account', accountId);
    return null;
  }

  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: creds.refresh_token,
    client_id: clientId,
  });
  if (clientSecret) body.set('client_secret', clientSecret);

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[GoogleCalendar] Token refresh failed:', res.status, text);
    q.updateCalendarAccount.run(row.account_email, row.credentials, 'error', null, null, Date.now(), accountId);
    return null;
  }

  const tokenData = await res.json();
  const newCreds = {
    access_token: tokenData.access_token,
    refresh_token: creds.refresh_token,
    expires_at: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
  };
  const newCredsStr = JSON.stringify(newCreds);
  q.updateCalendarAccount.run(row.account_email, newCredsStr, 'active', now, row.sync_token, Date.now(), accountId);

  return newCreds.access_token;
}

/**
 * Make authenticated request to Google Calendar API
 */
async function apiRequest(accountId, path, options = {}) {
  const token = await getAccessToken(accountId);
  if (!token) throw new Error('No valid access token');

  const url = path.startsWith('http') ? path : `https://www.googleapis.com/calendar/v3${path.startsWith('/') ? path : '/' + path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Calendar API ${res.status}: ${errText}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

/**
 * Fetch user info to get email
 */
async function fetchUserEmail(accountId) {
  const data = await apiRequest(accountId, 'https://www.googleapis.com/oauth2/v2/userinfo');
  return data?.email || 'unknown@google.com';
}

/**
 * List calendars from Google
 */
async function listGoogleCalendars(accountId) {
  const data = await apiRequest(accountId, '/users/me/calendarList');
  const items = data?.items || [];
  return items.map((c) => ({
    id: c.id,
    summary: c.summary || 'Untitled',
    backgroundColor: c.backgroundColor,
    primary: !!c.primary,
  }));
}

/**
 * List events from a Google calendar in range
 */
async function listGoogleEvents(accountId, calendarId, timeMin, timeMax, syncToken = null) {
  const params = new URLSearchParams();
  if (syncToken) params.set('syncToken', syncToken);
  else {
    params.set('timeMin', new Date(timeMin).toISOString());
    params.set('timeMax', new Date(timeMax).toISOString());
  }
  params.set('singleEvents', 'true');
  params.set('maxResults', '250');

  const data = await apiRequest(accountId, `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);
  return {
    items: data?.items || [],
    nextSyncToken: data?.nextSyncToken || null,
    nextPageToken: data?.nextPageToken || null,
  };
}

/**
 * Create event in Google Calendar
 */
async function createGoogleEvent(accountId, calendarId, event) {
  const body = {
    summary: event.title,
    description: event.description || undefined,
    location: event.location || undefined,
    start: event.all_day
      ? { date: new Date(event.start_at).toISOString().slice(0, 10) }
      : { dateTime: new Date(event.start_at).toISOString(), timeZone: event.timezone || 'UTC' },
    end: event.all_day
      ? { date: new Date(event.end_at).toISOString().slice(0, 10) }
      : { dateTime: new Date(event.end_at).toISOString(), timeZone: event.timezone || 'UTC' },
    reminders: event.reminders?.length
      ? { useDefault: false, overrides: event.reminders.map((r) => ({ minutes: r.minutes || 15 })) }
      : undefined,
  };
  const data = await apiRequest(accountId, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body,
  });
  return data;
}

/**
 * Update event in Google Calendar
 */
async function updateGoogleEvent(accountId, calendarId, googleEventId, event) {
  const body = {
    summary: event.title,
    description: event.description || undefined,
    location: event.location || undefined,
    start: event.all_day
      ? { date: new Date(event.start_at).toISOString().slice(0, 10) }
      : { dateTime: new Date(event.start_at).toISOString(), timeZone: event.timezone || 'UTC' },
    end: event.all_day
      ? { date: new Date(event.end_at).toISOString().slice(0, 10) }
      : { dateTime: new Date(event.end_at).toISOString(), timeZone: event.timezone || 'UTC' },
  };
  const data = await apiRequest(accountId, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`, {
    method: 'PATCH',
    body,
  });
  return data;
}

/**
 * Delete event in Google Calendar
 */
async function deleteGoogleEvent(accountId, calendarId, googleEventId) {
  await apiRequest(accountId, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`, {
    method: 'DELETE',
  });
}

/**
 * Sync all Google accounts: pull events, merge into local DB
 */
async function syncAll() {
  const q = database.getQueries();
  const accounts = q.getCalendarAccountsByProvider.all('google');
  if (accounts.length === 0) {
    return { success: true, synced: false, message: 'No Google accounts connected' };
  }

  const now = Date.now();
  const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
  const threeMonthsAhead = now + 90 * 24 * 60 * 60 * 1000;

  for (const acc of accounts) {
    try {
      const email = acc.account_email === 'pending@google.com'
        ? await fetchUserEmail(acc.id)
        : acc.account_email;
      if (acc.account_email === 'pending@google.com') {
        q.updateCalendarAccount.run(email, acc.credentials, 'active', acc.last_sync_at, acc.sync_token, now, acc.id);
      }

      const googleCals = await listGoogleCalendars(acc.id);
      for (const gc of googleCals) {
        let localCal = q.getCalendarCalendarsByAccount.all(acc.id).find((c) => c.remote_id === gc.id);
        if (!localCal) {
          const calId = `cal-${acc.id}-${gc.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
          q.createCalendarCalendar.run(calId, acc.id, gc.id, gc.summary, gc.backgroundColor, 1, gc.primary ? 1 : 0, now, now);
          localCal = q.getCalendarCalendarById.get(calId);
        }

        const { items } = await listGoogleEvents(acc.id, gc.id, oneMonthAgo, threeMonthsAhead);

        for (const ge of items) {
          if (ge.status === 'cancelled') {
            const link = q.getCalendarEventLinkByRemote.get('google', ge.id);
            if (link) q.deleteCalendarEvent.run(link.event_id);
            continue;
          }

          const startAt = ge.start?.dateTime
            ? new Date(ge.start.dateTime).getTime()
            : new Date(ge.start?.date + 'T00:00:00Z').getTime();
          const endAt = ge.end?.dateTime
            ? new Date(ge.end.dateTime).getTime()
            : new Date(ge.end?.date + 'T23:59:59Z').getTime();

          const link = q.getCalendarEventLinkByRemote.get('google', ge.id);
          if (link) {
            q.updateCalendarEvent.run(
              ge.summary || 'Untitled',
              ge.description || null,
              ge.location || null,
              startAt,
              endAt,
              ge.start?.timeZone || null,
              ge.start?.date ? 1 : 0,
              'confirmed',
              JSON.stringify(ge.reminders?.overrides || [{ minutes: 15 }]),
              null,
              'google',
              Date.now(),
              link.event_id
            );
          } else {
            const eventId = `evt-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
            q.createCalendarEvent.run(
              eventId,
              localCal.id,
              ge.summary || 'Untitled',
              ge.description || null,
              ge.location || null,
              startAt,
              endAt,
              ge.start?.timeZone || null,
              ge.start?.date ? 1 : 0,
              'confirmed',
              JSON.stringify(ge.reminders?.overrides || [{ minutes: 15 }]),
              null,
              'google',
              now,
              now
            );
            q.createCalendarEventLink.run(`link-${eventId}`, eventId, 'google', ge.id, gc.id, now, now);
          }
        }

        q.updateCalendarAccount.run(acc.account_email, acc.credentials, 'active', now, acc.sync_token, now, acc.id);
      }
    } catch (err) {
      console.error('[GoogleCalendar] Sync error for account', acc.id, err);
      q.updateCalendarAccount.run(acc.account_email, acc.credentials, 'error', acc.last_sync_at, acc.sync_token, now, acc.id);
    }
  }

  return { success: true, synced: true, accountsCount: accounts.length };
}

module.exports = {
  startOAuthFlow,
  handleOAuthCallback,
  getAccessToken,
  listGoogleCalendars,
  listGoogleEvents,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  syncAll,
  REDIRECT_URI,
};
