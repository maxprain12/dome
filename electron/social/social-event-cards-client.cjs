'use strict';

const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const domeOauth = require('../auth/dome-oauth.cjs');

const CARDS_CACHE_KEY = 'social_event_cards_cache_v1';
const DM_RULES_CACHE_KEY = 'social_dm_rules_cache_v1';
const UPDATES_CACHE_PREFIX = 'social_event_updates_cache_v1:';

/** In-flight provider refreshes keyed by cache slot (dedupe parallel list calls). */
const pendingRefresh = new Map();

function baseUrl() {
  return getDomeProviderBaseUrl().replace(/\/$/, '');
}

function queries(database) {
  return database.getQueries();
}

function readJsonSetting(database, key) {
  try {
    const raw = queries(database).getSetting.get(key)?.value;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeJsonSetting(database, key, value) {
  queries(database).setSetting.run(key, JSON.stringify(value), Date.now());
}

async function request(database, path, { method = 'GET', body, responseType = 'json' } = {}) {
  const response = await domeOauth.fetchWithDomeAuth(database, `${baseUrl()}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`social_event_cards_provider_failed:${response.status}${detail ? ` ${detail}` : ''}`);
  }
  if (responseType === 'buffer') return Buffer.from(await response.arrayBuffer());
  if (response.status === 204) return null;
  return response.json();
}

const enc = encodeURIComponent;

function readCardsCache(database) {
  return readJsonSetting(database, CARDS_CACHE_KEY);
}

function writeCardsCache(database, payload) {
  const cards = Array.isArray(payload?.cards) ? payload.cards : [];
  writeJsonSetting(database, CARDS_CACHE_KEY, {
    cards,
    wallet: payload?.wallet ?? { appleConfigured: false, googleConfigured: false },
    fetchedAt: Date.now(),
  });
}

function upsertCachedCard(database, card) {
  if (!card?.id) return;
  const cached = readCardsCache(database) || { cards: [], wallet: {} };
  const cards = Array.isArray(cached.cards) ? [...cached.cards] : [];
  const index = cards.findIndex((row) => row.id === card.id);
  if (index >= 0) cards[index] = card;
  else cards.unshift(card);
  writeCardsCache(database, { ...cached, cards });
}

function scheduleRefresh(slot, work) {
  const existing = pendingRefresh.get(slot);
  if (existing) return existing;
  const promise = Promise.resolve()
    .then(work)
    .finally(() => {
      if (pendingRefresh.get(slot) === promise) pendingRefresh.delete(slot);
    });
  pendingRefresh.set(slot, promise);
  return promise;
}

/**
 * Cache-first list: return local replica immediately when present, refresh provider in background.
 * @param {{ onRefreshed?: (data: unknown) => void }} [opts]
 */
async function listCards(database, opts = {}) {
  const cached = readCardsCache(database);
  if (cached?.cards) {
    scheduleRefresh('cards', async () => {
      try {
        const fresh = await request(database, '/api/v1/social/event-cards');
        writeCardsCache(database, fresh);
        opts.onRefreshed?.(fresh);
      } catch (error) {
        console.warn('[social-event-cards] background refresh failed:', error?.message || error);
      }
    });
    return { ...cached, fromCache: true };
  }
  const fresh = await request(database, '/api/v1/social/event-cards');
  writeCardsCache(database, fresh);
  return fresh;
}

async function getCard(database, id) {
  const result = await request(database, `/api/v1/social/event-cards/${enc(id)}`);
  const card = result?.card || result;
  if (card?.id) upsertCachedCard(database, card);
  return result;
}

async function createCard(database, input) {
  const result = await request(database, '/api/v1/social/event-cards', { method: 'POST', body: input });
  const card = result?.card || result;
  if (card?.id) upsertCachedCard(database, card);
  return result;
}

async function updateCard(database, id, patch) {
  const result = await request(database, `/api/v1/social/event-cards/${enc(id)}`, { method: 'PATCH', body: patch });
  const card = result?.card || result;
  if (card?.id) upsertCachedCard(database, card);
  return result;
}

async function publishCard(database, id) {
  const result = await request(database, `/api/v1/social/event-cards/${enc(id)}/publish`, { method: 'POST', body: {} });
  const card = result?.card || result;
  if (card?.id) upsertCachedCard(database, card);
  return result;
}

async function archiveCard(database, id) {
  const result = await request(database, `/api/v1/social/event-cards/${enc(id)}/archive`, { method: 'POST', body: {} });
  const card = result?.card || result;
  if (card?.id) upsertCachedCard(database, card);
  return result;
}

async function listUpdates(database, id, opts = {}) {
  const key = `${UPDATES_CACHE_PREFIX}${id}`;
  const cached = readJsonSetting(database, key);
  if (cached?.updates) {
    scheduleRefresh(`updates:${id}`, async () => {
      try {
        const fresh = await fetchUpdates(database, id);
        writeJsonSetting(database, key, { ...fresh, fetchedAt: Date.now() });
        opts.onRefreshed?.(fresh);
      } catch (error) {
        console.warn('[social-event-cards] updates refresh failed:', error?.message || error);
      }
    });
    return { ...cached, fromCache: true };
  }
  const fresh = await fetchUpdates(database, id);
  writeJsonSetting(database, key, { ...fresh, fetchedAt: Date.now() });
  return fresh;
}

async function fetchUpdates(database, id) {
  const result = await request(database, `/api/v1/social/event-cards/${enc(id)}/updates`);
  return {
    ...result,
    updates: (result.updates || []).map((row) => ({
      id: row.id,
      eventCardId: row.card_id,
      message: row.message,
      scheduledAt: row.scheduled_at,
      status: row.status,
      attempted: row.attempted || 0,
      accepted: row.accepted || 0,
      failed: row.failed || 0,
    })),
  };
}

async function createUpdate(database, id, input) {
  const result = await request(database, `/api/v1/social/event-cards/${enc(id)}/updates`, {
    method: 'POST',
    body: input,
  });
  // Invalidate updates cache for this card so next list pulls fresh (or we refresh now).
  try {
    const fresh = await fetchUpdates(database, id);
    writeJsonSetting(database, `${UPDATES_CACHE_PREFIX}${id}`, { ...fresh, fetchedAt: Date.now() });
  } catch {
    /* keep mutation result; cache stays stale until next open */
  }
  return result;
}

async function listDmRules(database, opts = {}) {
  const cached = readJsonSetting(database, DM_RULES_CACHE_KEY);
  if (cached?.rules) {
    scheduleRefresh('dm-rules', async () => {
      try {
        const fresh = await fetchDmRules(database);
        writeJsonSetting(database, DM_RULES_CACHE_KEY, { ...fresh, fetchedAt: Date.now() });
        opts.onRefreshed?.(fresh);
      } catch (error) {
        console.warn('[social-event-cards] dm-rules refresh failed:', error?.message || error);
      }
    });
    return { ...cached, fromCache: true };
  }
  const fresh = await fetchDmRules(database);
  writeJsonSetting(database, DM_RULES_CACHE_KEY, { ...fresh, fetchedAt: Date.now() });
  return fresh;
}

async function fetchDmRules(database) {
  const result = await request(database, '/api/v1/social/dm-rules');
  return {
    ...result,
    rules: (result.rules || []).map((row) => ({
      id: row.id,
      accountId: row.account_id,
      postExternalId: row.post_id,
      eventCardId: row.card_id,
      keyword: row.keyword,
      template: row.reply_template,
      status: row.enabled ? 'active' : 'paused',
      commentReplyEnabled: row.comment_reply_enabled !== false,
      commentReplyTemplate: row.comment_reply_template || 'Revisa tu DM ✉️',
      captureLead: row.capture_lead !== false,
      deliveries: row.social_dm_deliveries || [],
    })),
  };
}

async function createDmRule(database, input) {
  const result = await request(database, '/api/v1/social/dm-rules', { method: 'POST', body: input });
  try {
    const fresh = await fetchDmRules(database);
    writeJsonSetting(database, DM_RULES_CACHE_KEY, { ...fresh, fetchedAt: Date.now() });
  } catch {
    /* ignore */
  }
  return result;
}

async function updateDmRule(database, id, patch) {
  const result = await request(database, `/api/v1/social/dm-rules/${enc(id)}`, { method: 'PATCH', body: patch });
  try {
    const fresh = await fetchDmRules(database);
    writeJsonSetting(database, DM_RULES_CACHE_KEY, { ...fresh, fetchedAt: Date.now() });
  } catch {
    /* ignore */
  }
  return result;
}

async function deleteDmRule(database, id) {
  const result = await request(database, `/api/v1/social/dm-rules/${enc(id)}`, { method: 'DELETE' });
  try {
    const fresh = await fetchDmRules(database);
    writeJsonSetting(database, DM_RULES_CACHE_KEY, { ...fresh, fetchedAt: Date.now() });
  } catch {
    /* ignore */
  }
  return result;
}

module.exports = {
  listCards,
  getCard,
  createCard,
  updateCard,
  publishCard,
  archiveCard,
  metrics: (db, id) => request(db, `/api/v1/social/event-cards/${enc(id)}/metrics`),
  listUpdates,
  createUpdate,
  updateUpdate: (db, id, patch) => request(db, `/api/v1/social/event-updates/${enc(id)}`, { method: 'PATCH', body: patch }),
  listDmRules,
  createDmRule,
  updateDmRule,
  deleteDmRule,
  exportCard: (db, id, format) =>
    request(db, `/api/v1/social/event-cards/${enc(id)}/export?format=${enc(format)}`, { responseType: 'buffer' }),
  // test helpers
  _readCardsCache: readCardsCache,
  _writeCardsCache: writeCardsCache,
  CARDS_CACHE_KEY,
};
