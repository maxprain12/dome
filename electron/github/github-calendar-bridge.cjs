'use strict';

/* eslint-disable no-console */

/**
 * Projects GitHub entities with dates into Dome's calendar.
 *
 * - Milestones  → event on due_on (fecha de entrega), open or closed
 * - Issues      → event on parsed due_date (see github-store.parseIssueDueDate)
 * - Releases    → event on published_at
 *
 * Events live in a dedicated local "GitHub" calendar per vault and are tracked
 * through github_calendar_links so every sync upserts (never duplicates) and
 * removes the event when the date or entity disappears.
 */

const crypto = require('crypto');
const database = require('../core/database.cjs');
const store = require('./github-store.cjs');
const calendarService = require('../calendar/calendar-service.cjs');

const LEGACY_GITHUB_CALENDAR_ID = 'github-dome';

function slug(s) {
  return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);
}

function normalizeProjectId(projectId) {
  return store.normalizeProjectId(projectId);
}

function githubCalendarId(projectId) {
  const pid = normalizeProjectId(projectId);
  return pid === 'default' ? 'github-default' : `github-${slug(pid)}`;
}

function localAccountId(projectId) {
  const pid = normalizeProjectId(projectId);
  return pid === 'default' ? 'local' : `local-${pid}`;
}

function getSetting(key, def) {
  try {
    const v = database.getQueries().getSetting?.get?.(key)?.value;
    return v == null || v === '' ? def : v;
  } catch {
    return def;
  }
}

function isEnabled(kind) {
  return getSetting(`github_calendar_${kind}`, 'true') === 'true';
}

/** Ensure the dedicated local "GitHub" calendar exists for a vault. */
function ensureGithubCalendar(projectId) {
  const pid = normalizeProjectId(projectId);
  const calId = githubCalendarId(pid);
  const db = database.getDB();
  const existing = db.prepare('SELECT id FROM calendar_calendars WHERE id = ?').get(calId);
  if (existing) return calId;

  const q = database.getQueries();
  const accountId = localAccountId(pid);
  const now = Date.now();

  if (pid !== 'default') {
    let acc = q.getCalendarAccountById.get(accountId);
    if (!acc) {
      q.createCalendarAccount.run(accountId, 'local', 'local@dome', '{}', 'active', null, null, pid, now, now);
    }
  }

  db.prepare(
    `INSERT OR IGNORE INTO calendar_calendars
      (id, account_id, remote_id, title, color, is_selected, is_default, created_at, updated_at)
     VALUES (?, ?, 'github', 'GitHub', '#6e40c9', 1, 0, ?, ?)`,
  ).run(calId, accountId, now, now);
  return calId;
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

function buildReleaseDescription(rel) {
  const raw = typeof rel.body === 'string' ? rel.body.trim() : '';
  if (!raw) return rel.html_url || rel.tag_name;
  return raw;
}

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

async function upsertEvent(projectId, entityType, entityId, { title, description, dateMs, url, extraMetadata = {} }) {
  const calId = ensureGithubCalendar(projectId);
  const link = store.getCalendarLink(entityType, entityId);
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
    if (!res?.success) {
      return createAndLink(projectId, calId, entityType, entityId, { title, description: body, startAt, endAt, metadata });
    }
    return;
  }
  return createAndLink(projectId, calId, entityType, entityId, { title, description: body, startAt, endAt, metadata });
}

async function createAndLink(projectId, calId, entityType, entityId, { title, description, startAt, endAt, metadata }) {
  const res = await calendarService.createEvent({
    calendar_id: calId,
    projectId: normalizeProjectId(projectId),
    title,
    description: description || null,
    start_at: startAt,
    end_at: endAt,
    all_day: 1,
    metadata,
  });
  if (res?.success && res.event?.id) {
    store.upsertCalendarLink(entityType, entityId, res.event.id);
  }
}

async function removeEvent(entityType, entityId) {
  const link = store.getCalendarLink(entityType, entityId);
  if (link?.event_id) {
    await calendarService.deleteEvent(link.event_id).catch(() => {});
  }
  store.deleteCalendarLink(entityType, entityId);
}

async function syncCalendar(repos) {
  const list = Array.isArray(repos) && repos.length > 0 ? repos : store.listSelectedRepos();
  const milestonesOn = isEnabled('milestones');
  const issuesOn = isEnabled('issues');
  const releasesOn = isEnabled('releases');

  let ops = 0;
  const breathe = async () => {
    if (++ops % 25 === 0) await new Promise((r) => setImmediate(r));
  };

  for (const repo of list) {
    const projectId = repo.project_id || 'default';
    ensureGithubCalendar(projectId);

    for (const m of store.listMilestonesWithDueOn(repo.id)) {
      await removeEvent('milestone', completedMilestoneLinkId(m.id));

      const completed = m.state === 'closed';
      if (milestonesOn && m.due_on) {
        await upsertEvent(projectId, 'milestone', m.id, {
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

    for (const issue of store.listIssuesForCalendar(repo.id)) {
      if (issuesOn) {
        await upsertEvent(projectId, 'issue', issue.id, {
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

    const oneYearAgo = Date.now() - 350 * 24 * 60 * 60 * 1000;
    for (const rel of store.listReleases(repo.id)) {
      if (releasesOn && rel.published_at && rel.published_at >= oneYearAgo) {
        await upsertEvent(projectId, 'release', rel.id, {
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

async function purgeAllEvents() {
  const eventIds = store.listAllCalendarLinkEventIds();
  let i = 0;
  for (const id of eventIds) {
    await calendarService.deleteEvent(id).catch(() => {});
    if (++i % 25 === 0) await new Promise((r) => setImmediate(r));
  }
  try {
    const db = database.getDB();
    const calIds = store.listGithubCalendarIds();
    if (!calIds.includes(LEGACY_GITHUB_CALENDAR_ID)) calIds.push(LEGACY_GITHUB_CALENDAR_ID);
    for (const calId of calIds) {
      db.prepare('DELETE FROM calendar_events WHERE calendar_id = ?').run(calId);
      db.prepare('DELETE FROM calendar_calendars WHERE id = ?').run(calId);
    }
  } catch {
    /* best-effort */
  }
}

module.exports = {
  syncCalendar,
  ensureGithubCalendar,
  purgeAllEvents,
  githubCalendarId,
  LEGACY_GITHUB_CALENDAR_ID,
};
