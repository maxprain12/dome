'use strict';

/* eslint-disable no-console */

/**
 * Projects GitHub entities with dates into Dome's calendar.
 *
 * - Milestones  → event on due_on (fecha de entrega), open or closed
 * - Issues      → event on parsed due_date (see github-store.parseIssueDueDate)
 * - Releases    → event on published_at
 *
 * Events live in a dedicated local "GitHub" calendar and are tracked through
 * github_calendar_links so every sync upserts (never duplicates) and removes
 * the event when the date or entity disappears.
 */

const database = require('../core/database.cjs');
const store = require('./github-store.cjs');
const calendarService = require('../calendar/calendar-service.cjs');

const GITHUB_CALENDAR_ID = 'github-dome';

function getSetting(key, def) {
  try {
    const v = database.getQueries().getSetting?.get?.(key)?.value;
    return v == null || v === '' ? def : v;
  } catch {
    return def;
  }
}

function isEnabled(kind) {
  // Default-on toggles set from GitHub settings.
  return getSetting(`github_calendar_${kind}`, 'true') === 'true';
}

/** Ensure the dedicated local "GitHub" calendar exists. */
async function ensureGithubCalendar() {
  const db = database.getDB();
  const existing = await db.get('SELECT id FROM calendar_calendars WHERE id = ?', [GITHUB_CALENDAR_ID]);
  if (existing) return GITHUB_CALENDAR_ID;
  const ts = Date.now();
  await db.run(
    `INSERT OR IGNORE INTO calendar_calendars
      (id, account_id, remote_id, title, color, is_selected, is_default, created_at, updated_at)
     VALUES (?, 'local', 'github', 'GitHub', '#6e40c9', 1, 0, ?, ?)`,
    [GITHUB_CALENDAR_ID, ts, ts],
  );
  return GITHUB_CALENDAR_ID;
}

function withSourceFooter(description, url) {
  const base = (description || '').trim();
  const footer = url ? `Fuente: GitHub · ${url}` : 'Fuente: GitHub';
  return base ? `${base}\n\n— ${footer}` : `— ${footer}`;
}

function formatDateEs(ms) {
  if (!ms) return null;
  try {
    return new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return null;
  }
}

/** Build a markdown body for release calendar events. Falls back to the URL when
 *  no `body` was stored (older syncs / releases with no notes on GitHub). */
function buildReleaseDescription(rel) {
  const raw = typeof rel.body === 'string' ? rel.body.trim() : '';
  if (!raw) return rel.html_url || rel.tag_name;
  return raw;
}

/** Rich markdown body for milestone calendar events. */
function buildMilestoneDescription(m, repo, { completed = false } = {}) {
  const parts = [];
  parts.push(`**Repositorio:** \`${repo.full_name}\``);
  parts.push(`**Hito:** ${m.title}`);
  if (m.due_on) {
    parts.push(`**Fecha de entrega:** ${formatDateEs(m.due_on)}`);
  }
  if (m.description?.trim()) parts.push(m.description.trim());
  const total = (m.open_issues || 0) + (m.closed_issues || 0);
  const progress =
    total > 0
      ? `${m.closed_issues}/${total} issues cerradas (${Math.round((100 * m.closed_issues) / total)}%)`
      : `${m.closed_issues || 0} issues cerradas`;
  parts.push(`**Progreso:** ${progress}`);
  if (completed) {
    if (m.closed_at) parts.push(`**Completado:** ${formatDateEs(m.closed_at)}`);
    parts.push('**Estado:** milestone completado');
  } else {
    parts.push(`**Estado:** abierto · ${m.open_issues || 0} issues abiertas`);
  }
  return parts.join('\n\n');
}

function completedMilestoneLinkId(milestoneId) {
  return `${milestoneId}:completed`;
}

async function upsertEvent(entityType, entityId, { title, description, dateMs, url, extraMetadata = {} }) {
  const link = await store.getCalendarLink(entityType, entityId);
  // Snap to the start of the local day so all-day events render in exactly one
  // cell. GitHub's `published_at` / `due_on` come with arbitrary hours (UTC),
  // and `endAt = startAt + 24h` would otherwise land mid-day and the renderer
  // (which only collapses `end == startOfNextDay` back to a single day) would
  // paint the event across two columns.
  const dayStart = new Date(dateMs);
  dayStart.setHours(0, 0, 0, 0);
  const startAt = dayStart.getTime();
  const endAt = startAt + 24 * 60 * 60 * 1000;
  const body = withSourceFooter(description, url);
  const metadata = { source: 'github', entityType, entityId, url: url || null, ...extraMetadata };

  if (link?.event_id) {
    const res = await calendarService.updateEvent(link.event_id, {
      title,
      description: body,
      start_at: startAt,
      end_at: endAt,
      all_day: 1,
      metadata,
    });
    // Event was deleted out from under us → recreate.
    if (!res?.success) return createAndLink(entityType, entityId, { title, description: body, startAt, endAt, metadata });
    return;
  }
  return createAndLink(entityType, entityId, { title, description: body, startAt, endAt, metadata });
}

async function createAndLink(entityType, entityId, { title, description, startAt, endAt, metadata }) {
  const res = await calendarService.createEvent({
    calendar_id: GITHUB_CALENDAR_ID,
    title,
    description: description || null,
    start_at: startAt,
    end_at: endAt,
    all_day: 1,
    metadata,
  });
  if (res?.success && res.event?.id) {
    await store.upsertCalendarLink(entityType, entityId, res.event.id);
  }
}

async function removeEvent(entityType, entityId) {
  const link = await store.getCalendarLink(entityType, entityId);
  if (link?.event_id) {
    await calendarService.deleteEvent(link.event_id).catch(() => {});
  }
  await store.deleteCalendarLink(entityType, entityId);
}

/** Reproject all dated entities for the selected repos. Idempotent. */
async function syncCalendar() {
  await ensureGithubCalendar();
  const repos = await store.listSelectedRepos();
  const milestonesOn = isEnabled('milestones');
  const issuesOn = isEnabled('issues');
  const releasesOn = isEnabled('releases');

  // Yield to the event loop every N writes so calendar/listEvents IPC (and the
  // rest of the app) isn't starved while projecting many events on the main process.
  let ops = 0;
  const breathe = async () => {
    if (++ops % 25 === 0) await new Promise((r) => setImmediate(r));
  };

  for (const repo of repos) {
    // Milestones — always on due_on (fecha de entrega), open or closed
    for (const m of await store.listMilestones(repo.id)) {
      // Remove legacy completion-date events from earlier bridge versions
      await removeEvent('milestone', completedMilestoneLinkId(m.id));

      const completed = m.state === 'closed';
      if (milestonesOn && m.due_on) {
        await upsertEvent('milestone', m.id, {
          title: `${completed ? '✅' : '🏁'} ${m.title}`,
          description: buildMilestoneDescription(m, repo, { completed }),
          dateMs: m.due_on,
          url: m.html_url,
          extraMetadata: {
            repoFullName: repo.full_name,
            milestoneTitle: m.title,
            dueOn: m.due_on,
            milestoneState: m.state,
          },
        });
      } else {
        await removeEvent('milestone', m.id);
      }
      await breathe();
    }
    // Issues with a parsed due date
    for (const issue of await store.listIssues(repo.id)) {
      if (issuesOn && issue.due_date && issue.state === 'open') {
        await upsertEvent('issue', issue.id, {
          title: `#${issue.number} ${issue.title}`,
          description: issue.body,
          dateMs: issue.due_date,
          url: issue.html_url,
          extraMetadata: {
            repoFullName: repo.full_name,
            issueNumber: issue.number,
            issueTitle: issue.title,
            issueState: issue.state,
          },
        });
      } else {
        await removeEvent('issue', issue.id);
      }
      await breathe();
    }
    // Releases (calendar rejects dates >1y in the past, so skip stale ones)
    const oneYearAgo = Date.now() - 350 * 24 * 60 * 60 * 1000;
    for (const rel of await store.listReleases(repo.id)) {
      if (releasesOn && rel.published_at && rel.published_at >= oneYearAgo) {
        await upsertEvent('release', rel.id, {
          title: `🚀 ${rel.name || rel.tag_name}`,
          description: buildReleaseDescription(rel),
          dateMs: rel.published_at,
          url: rel.html_url,
          extraMetadata: {
            repoFullName: repo.full_name,
            tagName: rel.tag_name,
            releaseName: rel.name || null,
            publishedAt: rel.published_at,
          },
        });
      } else {
        await removeEvent('release', rel.id);
      }
      await breathe();
    }
  }
}

/** Delete every GitHub-originated calendar event + the GitHub calendar itself. */
async function purgeAllEvents() {
  const eventIds = await store.listAllCalendarLinkEventIds();
  let i = 0;
  for (const id of eventIds) {
    await calendarService.deleteEvent(id).catch(() => {});
    if (++i % 25 === 0) await new Promise((r) => setImmediate(r));
  }
  try {
    const db = database.getDB();
    // Remove any stray github events then the calendar row.
    await db.run('DELETE FROM calendar_events WHERE calendar_id = ?', [GITHUB_CALENDAR_ID]);
    await db.run('DELETE FROM calendar_calendars WHERE id = ?', [GITHUB_CALENDAR_ID]);
  } catch {
    /* best-effort */
  }
}

module.exports = { syncCalendar, ensureGithubCalendar, purgeAllEvents, GITHUB_CALENDAR_ID };
