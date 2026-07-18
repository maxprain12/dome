'use strict';

const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const domeOauth = require('../auth/dome-oauth.cjs');

function baseUrl() {
  return getDomeProviderBaseUrl().replace(/\/$/, '');
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

async function listUpdates(database, id) {
  const result = await request(database, `/api/v1/social/event-cards/${enc(id)}/updates`);
  return { ...result, updates: (result.updates || []).map((row) => ({
    id: row.id, eventCardId: row.card_id, message: row.message, scheduledAt: row.scheduled_at,
    status: row.status, attempted: row.attempted || 0, accepted: row.accepted || 0, failed: row.failed || 0,
  })) };
}

async function listDmRules(database) {
  const result = await request(database, '/api/v1/social/dm-rules');
  return { ...result, rules: (result.rules || []).map((row) => ({
    id: row.id, accountId: row.account_id, postExternalId: row.post_id, eventCardId: row.card_id,
    keyword: row.keyword, template: row.reply_template, status: row.enabled ? 'active' : 'paused', deliveries: row.social_dm_deliveries || [],
  })) };
}

module.exports = {
  listCards: (db) => request(db, '/api/v1/social/event-cards'),
  getCard: (db, id) => request(db, `/api/v1/social/event-cards/${enc(id)}`),
  createCard: (db, input) => request(db, '/api/v1/social/event-cards', { method: 'POST', body: input }),
  updateCard: (db, id, patch) => request(db, `/api/v1/social/event-cards/${enc(id)}`, { method: 'PATCH', body: patch }),
  publishCard: (db, id) => request(db, `/api/v1/social/event-cards/${enc(id)}/publish`, { method: 'POST', body: {} }),
  archiveCard: (db, id) => request(db, `/api/v1/social/event-cards/${enc(id)}/archive`, { method: 'POST', body: {} }),
  metrics: (db, id) => request(db, `/api/v1/social/event-cards/${enc(id)}/metrics`),
  listUpdates,
  createUpdate: (db, id, input) => request(db, `/api/v1/social/event-cards/${enc(id)}/updates`, { method: 'POST', body: input }),
  updateUpdate: (db, id, patch) => request(db, `/api/v1/social/event-updates/${enc(id)}`, { method: 'PATCH', body: patch }),
  listDmRules,
  createDmRule: (db, input) => request(db, '/api/v1/social/dm-rules', { method: 'POST', body: input }),
  updateDmRule: (db, id, patch) => request(db, `/api/v1/social/dm-rules/${enc(id)}`, { method: 'PATCH', body: patch }),
  deleteDmRule: (db, id) => request(db, `/api/v1/social/dm-rules/${enc(id)}`, { method: 'DELETE' }),
  exportCard: (db, id, format) => request(db, `/api/v1/social/event-cards/${enc(id)}/export?format=${enc(format)}`, { responseType: 'buffer' }),
};
