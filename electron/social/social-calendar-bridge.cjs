'use strict';

/* eslint-disable no-console */

/**
 * Mirrors scheduled social posts into Dome's calendar (same pattern as
 * github-calendar-bridge): a dedicated local "Social" calendar holds one
 * event per post with a `scheduledAt`, upserted on every post mutation and
 * removed when the schedule is cleared or the post is deleted.
 *
 * Events are matched back to posts through `metadata.postId` (the social
 * calendar is small, so a LIKE lookup is enough — no extra link table).
 */

const database = require('../core/database.cjs');
const calendarService = require('../calendar/calendar-service.cjs');

const SOCIAL_CALENDAR_ID = 'social-default';
const SOCIAL_CALENDAR_COLOR = '#c13584';
const EVENT_DURATION_MS = 30 * 60 * 1000;

const PROVIDER_LABELS = { linkedin: 'LinkedIn', instagram: 'Instagram', x: 'X' };
const STATUS_EMOJI = {
  scheduled: '📣',
  publishing: '📣',
  published: '✅',
  failed: '⚠️',
};

/** Ensure the dedicated local "Social" calendar exists (default vault). */
function ensureSocialCalendar() {
  const db = database.getDB();
  const existing = db.prepare('SELECT id FROM calendar_calendars WHERE id = ?').get(SOCIAL_CALENDAR_ID);
  if (existing) return SOCIAL_CALENDAR_ID;
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO calendar_calendars
      (id, account_id, remote_id, title, color, is_selected, is_default, created_at, updated_at)
     VALUES (?, 'local', 'social', 'Social', ?, 1, 0, ?, ?)`,
  ).run(SOCIAL_CALENDAR_ID, SOCIAL_CALENDAR_COLOR, now, now);
  return SOCIAL_CALENDAR_ID;
}

function findEventIdForPost(postId) {
  try {
    const db = database.getDB();
    const row = db
      .prepare('SELECT id FROM calendar_events WHERE calendar_id = ? AND metadata LIKE ?')
      .get(SOCIAL_CALENDAR_ID, `%"postId":"${postId}"%`);
    return row?.id ?? null;
  } catch {
    return null;
  }
}

function snippet(post) {
  const text = String(post.body || '').replace(/\s+/g, ' ').trim();
  if (text) return text.length > 60 ? `${text.slice(0, 57)}…` : text;
  const firstMedia = Array.isArray(post.media) ? post.media[0] : null;
  return firstMedia?.name || firstMedia?.url || '(sin texto)';
}

function buildEventFields(post) {
  const hasVideo = Array.isArray(post.media)
    && post.media.some((m) => m?.type === 'video' || m?.type === 'reel');
  const emoji = STATUS_EMOJI[post.status] || '📣';
  const media = hasVideo ? '🎬 ' : '';
  const providerLabel = PROVIDER_LABELS[post.provider] || post.provider;
  const title = `${emoji} ${media}${providerLabel} · ${snippet(post)}`;

  const parts = [];
  if (post.body?.trim()) parts.push(post.body.trim());
  if (post.campaign) parts.push(`**Campaña:** ${post.campaign}`);
  if (Array.isArray(post.topics) && post.topics.length > 0) {
    parts.push(`**Temas:** ${post.topics.join(', ')}`);
  }
  if (post.externalUrl) parts.push(post.externalUrl);
  parts.push(`— Fuente: Social · ${providerLabel} · estado: ${post.status}`);

  const startAt = post.scheduledAt;
  return {
    title,
    description: parts.join('\n\n'),
    start_at: startAt,
    end_at: startAt + EVENT_DURATION_MS,
    all_day: 0,
    metadata: {
      source: 'social',
      postId: post.id,
      provider: post.provider,
      status: post.status,
      externalUrl: post.externalUrl || null,
    },
  };
}

/** Upsert (or remove) the calendar event that mirrors a post. */
async function syncPostEvent(post) {
  try {
    if (!post?.id) return;
    const eventId = findEventIdForPost(post.id);
    const shouldShow = Boolean(post.scheduledAt) && post.status !== 'draft';
    if (!shouldShow) {
      if (eventId) await calendarService.deleteEvent(eventId).catch(() => {});
      return;
    }
    ensureSocialCalendar();
    const fields = buildEventFields(post);
    if (eventId) {
      const res = await calendarService.updateEvent(eventId, fields);
      if (res?.success) return;
    }
    await calendarService.createEvent({ calendar_id: SOCIAL_CALENDAR_ID, ...fields });
  } catch (err) {
    console.warn('[Social] calendar sync failed for post', post?.id, err.message);
  }
}

async function removePostEvent(postId) {
  try {
    const eventId = findEventIdForPost(postId);
    if (eventId) await calendarService.deleteEvent(eventId).catch(() => {});
  } catch (err) {
    console.warn('[Social] calendar event removal failed for post', postId, err.message);
  }
}

/** Backfill: mirror every post that already has a schedule (boot-time catch-up). */
async function syncAllFromStore(store) {
  try {
    const posts = store.listPosts({ limit: 500 });
    for (const post of posts) {
      if (post.scheduledAt) await syncPostEvent(post);
    }
  } catch (err) {
    console.warn('[Social] calendar backfill failed:', err.message);
  }
}

module.exports = {
  syncPostEvent,
  removePostEvent,
  syncAllFromStore,
  ensureSocialCalendar,
  SOCIAL_CALENDAR_ID,
};
