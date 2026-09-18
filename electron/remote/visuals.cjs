'use strict';

const { looksOpaque } = require('./refs.cjs');

const SKIP_TOOLS = new Set(['social_accounts_list']);
const PROVIDER_LABEL = Object.freeze({
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
});

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function unwrapResult(result) {
  let parsed = result;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  const root = asRecord(parsed);
  if (!root) return null;
  if (Array.isArray(root.content)) {
    const text = root.content[0]?.text;
    if (typeof text === 'string') {
      try {
        const nested = JSON.parse(text);
        if (asRecord(nested)) parsed = nested;
      } catch {
        /* keep root */
      }
    }
  }
  const obj = asRecord(parsed);
  if (!obj || obj.success === false) return null;
  const data = asRecord(obj.data);
  if (data) return { ...obj, ...data };
  return obj;
}

function providerLabel(provider) {
  return PROVIDER_LABEL[provider] || null;
}

function asProvider(value) {
  return typeof value === 'string' && PROVIDER_LABEL[value] ? value : null;
}

function compactText(value, max = 280) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function fromPublicCard(card) {
  const rec = asRecord(card);
  if (!rec) return null;
  const provider = asProvider(rec.provider);
  if (!provider) return null;
  const author = asRecord(rec.author) || {};
  const name = compactText(author.name || author.handle || rec.title || provider, 80);
  const handle = compactText(author.handle, 48);
  const kind = rec.kind === 'post' ? 'post' : 'profile';
  return {
    kind,
    name,
    handle: handle ? handle.replace(/^@/, '') : null,
    provider,
    providerLabel: providerLabel(provider),
    bio: compactText(rec.body || rec.bio, 220),
    avatarUrl: typeof author.avatarUrl === 'string' ? author.avatarUrl.slice(0, 500) : null,
    url: typeof rec.url === 'string' ? rec.url.slice(0, 500) : null,
    followers: typeof rec.followers === 'number' ? rec.followers : null,
    postsCount: typeof rec.postsCount === 'number' ? rec.postsCount : null,
    following: typeof rec.following === 'number' ? rec.following : null,
  };
}

function fromAccount(account) {
  const rec = asRecord(account);
  if (!rec) return null;
  const provider = asProvider(rec.provider);
  if (!provider) return null;
  return {
    kind: 'profile',
    name: compactText(rec.displayName || rec.handle || provider, 80),
    handle: compactText(rec.handle, 48),
    provider,
    providerLabel: providerLabel(provider),
    bio: null,
    avatarUrl: typeof rec.avatarUrl === 'string' ? rec.avatarUrl.slice(0, 500) : null,
    url: null,
    followers: typeof rec.followers === 'number' ? rec.followers : null,
    postsCount: typeof rec.postsCount === 'number' ? rec.postsCount : null,
    following: typeof rec.following === 'number' ? rec.following : null,
  };
}

function toIso(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    return value.trim().slice(0, 40);
  }
  return null;
}

function fromEvent(event) {
  const rec = asRecord(event);
  if (!rec) return null;
  const name = compactText(rec.title, 80);
  if (!name || looksOpaque(name)) return null;
  return {
    kind: 'event',
    name,
    startAt: toIso(rec.start_at_iso || rec.startAt || rec.start_at),
    endAt: toIso(rec.end_at_iso || rec.endAt || rec.end_at),
    allDay: rec.all_day === true || rec.allDay === true,
    location: compactText(rec.location, 80),
  };
}

function fromEventList(obj) {
  const rows = Array.isArray(obj.events) ? obj.events : Array.isArray(obj.items) ? obj.items : [];
  const items = [];
  for (const row of rows) {
    const event = fromEvent(row);
    if (!event) continue;
    items.push(event);
    if (items.length >= 8) break;
  }
  if (items.length === 0) return null;
  return { kind: 'events', name: 'Agenda', items };
}

function fromResource(obj) {
  const rec = asRecord(obj.resource) || asRecord(obj);
  if (!rec) return null;
  const name = compactText(rec.title, 120);
  if (!name || looksOpaque(name)) return null;
  const type = String(rec.type || 'note').toLowerCase();
  const kind = type === 'note' ? 'note' : type === 'ppt' || type === 'pptx' ? 'ppt' : 'resource';
  const resourceId = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : null;
  return {
    kind,
    name,
    type,
    excerpt: compactText(rec.content, 280),
    ...(resourceId ? { resourceId } : {}),
  };
}

function fromFlashcards(obj) {
  const rec = asRecord(obj.deck) || asRecord(obj);
  if (!rec) return null;
  const name = compactText(rec.title, 120);
  if (!name || looksOpaque(name)) return null;
  const count = typeof rec.card_count === 'number'
    ? rec.card_count
    : typeof rec.cardCount === 'number'
      ? rec.cardCount
      : null;
  return { kind: 'flashcards', name, count };
}

function fromSocial(obj) {
  const card = fromPublicCard(obj.card) || fromPublicCard(obj.reference);
  if (card) return card;
  if (asRecord(obj.post)) {
    const post = fromPublicCard({ ...obj.post, kind: 'post', provider: obj.post.provider });
    if (post) return post;
  }
  if (asRecord(obj.account)) {
    const profile = fromAccount(obj.account);
    if (profile) return profile;
  }
  return null;
}

function extractRemoteVisual(toolName, result) {
  const name = String(toolName || '').toLowerCase();
  if (SKIP_TOOLS.has(name)) return null;
  const obj = unwrapResult(result) || unwrapResult(asRecord(result)?.details);
  if (!obj) return null;

  if (name.startsWith('social_') || name === 'browser_extract_social') {
    return fromSocial(obj);
  }
  if (name === 'resource_create' || name === 'resource_update' || name === 'ppt_create') {
    return fromResource(obj);
  }
  if (
    name === 'calendar_create_event'
    || name === 'calendar_update_event'
    || name === 'calendar_create'
    || name === 'calendar_update'
  ) {
    return fromEvent(obj.event) || fromEvent(obj);
  }
  if (name === 'calendar_list_events' || name === 'calendar_get_upcoming') {
    return fromEventList(obj);
  }
  if (name === 'flashcard_create') {
    return fromFlashcards(obj);
  }
  return null;
}

module.exports = {
  extractRemoteVisual,
  unwrapResult,
};
