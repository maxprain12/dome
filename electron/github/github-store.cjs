'use strict';

/**
 * SQLite data layer for GitHub project sync (migration 43 tables).
 * All reads/writes for github_* tables live here; the sync service and IPC
 * handlers go through these helpers.
 */

const crypto = require('crypto');
const database = require('../core/database.cjs');

const db = () => database.getDB();
const now = () => Date.now();

function slug(s) {
  return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);
}

// --- repos -----------------------------------------------------------------

function repoId(remoteId) {
  return `ghr-${remoteId}`;
}

async function upsertRepo(remote) {
  const id = repoId(remote.id);
  const ts = now();
  await db().run(
    `INSERT INTO github_repos (id, remote_id, owner, name, full_name, private, html_url, selected, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?,
       COALESCE((SELECT selected FROM github_repos WHERE id = ?), 0), ?, ?)
     ON CONFLICT(full_name) DO UPDATE SET
       owner = excluded.owner, name = excluded.name, private = excluded.private,
       html_url = excluded.html_url, updated_at = excluded.updated_at`,
    [
      id,
      remote.id,
      remote.owner?.login || '',
      remote.name,
      remote.full_name,
      remote.private ? 1 : 0,
      remote.html_url || null,
      id,
      ts,
      ts,
    ],
  );
  return id;
}

async function listRepos() {
  return await db().all('SELECT * FROM github_repos ORDER BY full_name', []);
}

async function listSelectedRepos() {
  return await db().all('SELECT * FROM github_repos WHERE selected = 1 ORDER BY full_name', []);
}

async function getRepo(id) {
  return await db().get('SELECT * FROM github_repos WHERE id = ?', [id]);
}

async function setRepoSelected(id, selected) {
  await db().run('UPDATE github_repos SET selected = ?, updated_at = ? WHERE id = ?', [selected ? 1 : 0, now(), id]);
}

async function touchRepoSync(id) {
  await db().run('UPDATE github_repos SET last_sync_at = ? WHERE id = ?', [now(), id]);
}

// --- sync state (ETags) ----------------------------------------------------

async function getEtag(rId, resource) {
  return (await db().get('SELECT etag FROM github_sync_state WHERE repo_id = ? AND resource = ?', [rId, resource]))?.etag || null;
}

async function setEtag(rId, resource, etag) {
  const ts = now();
  await db().run(
    `INSERT INTO github_sync_state (id, repo_id, resource, etag, last_synced_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(repo_id, resource) DO UPDATE SET etag = excluded.etag, last_synced_at = excluded.last_synced_at`,
    [`ghs-${rId}-${resource}`, rId, resource, etag || null, ts],
  );
}

// --- milestones ------------------------------------------------------------

function milestoneId(rId, number) {
  return `ghm-${rId}-${number}`;
}

async function upsertMilestoneFromRemote(rId, m) {
  const id = milestoneId(rId, m.number);
  const ts = now();
  const remoteUpdated = m.updated_at ? Date.parse(m.updated_at) : ts;
  await db().run(
    `INSERT INTO github_milestones
      (id, repo_id, number, title, description, due_on, state, open_issues, closed_issues, html_url, closed_at, remote_updated_at, dome_updated_at, dirty, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)
     ON CONFLICT(repo_id, number) DO UPDATE SET
       title = excluded.title, description = excluded.description, due_on = excluded.due_on,
       state = excluded.state, open_issues = excluded.open_issues, closed_issues = excluded.closed_issues,
       html_url = excluded.html_url, closed_at = excluded.closed_at, remote_updated_at = excluded.remote_updated_at,
       dirty = 0, updated_at = excluded.updated_at`,
    [
      id,
      rId,
      m.number,
      m.title,
      m.description || null,
      m.due_on ? Date.parse(m.due_on) : null,
      m.state === 'closed' ? 'closed' : 'open',
      m.open_issues || 0,
      m.closed_issues || 0,
      m.html_url || null,
      m.closed_at ? Date.parse(m.closed_at) : null,
      remoteUpdated,
      ts,
      ts,
    ],
  );
  return id;
}

async function listMilestones(rId) {
  return await db().all('SELECT * FROM github_milestones WHERE repo_id = ? ORDER BY due_on IS NULL, due_on', [rId]);
}

async function getMilestone(id) {
  return await db().get('SELECT * FROM github_milestones WHERE id = ?', [id]);
}

async function listDirtyMilestones() {
  return await db().all('SELECT * FROM github_milestones WHERE dirty = 1', []);
}

/** Apply a local edit (renderer-driven), marking the row dirty for push. */
async function updateLocalMilestone(id, patch) {
  const m = await getMilestone(id);
  if (!m) return null;
  const ts = now();
  await db().run(
    `UPDATE github_milestones SET title = ?, description = ?, due_on = ?,
      state = ?, dome_updated_at = ?, dirty = 1, updated_at = ? WHERE id = ?`,
    [
      patch.title ?? m.title,
      patch.description ?? m.description,
      patch.dueOn !== undefined ? patch.dueOn : m.due_on,
      patch.state ?? m.state,
      ts,
      ts,
      id,
    ],
  );
  return getMilestone(id);
}

async function markMilestoneClean(id) {
  await db().run('UPDATE github_milestones SET dirty = 0 WHERE id = ?', [id]);
}

// --- issues ----------------------------------------------------------------

function issueId(rId, number) {
  return `ghi-${rId}-${number}`;
}

async function upsertIssueFromRemote(rId, issue) {
  const id = issueId(rId, issue.number);
  const ts = now();
  const remoteUpdated = issue.updated_at ? Date.parse(issue.updated_at) : ts;
  await db().run(
    `INSERT INTO github_issues
      (id, repo_id, number, title, body, state, milestone_number, due_date, labels, assignees, is_pull_request, html_url, remote_updated_at, dome_updated_at, dirty, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)
     ON CONFLICT(repo_id, number) DO UPDATE SET
       title = excluded.title, body = excluded.body, state = excluded.state,
       milestone_number = excluded.milestone_number, due_date = excluded.due_date,
       labels = excluded.labels, assignees = excluded.assignees, is_pull_request = excluded.is_pull_request,
       html_url = excluded.html_url, remote_updated_at = excluded.remote_updated_at,
       dirty = 0, updated_at = excluded.updated_at`,
    [
      id,
      rId,
      issue.number,
      issue.title,
      issue.body || null,
      issue.state === 'closed' ? 'closed' : 'open',
      issue.milestone?.number ?? null,
      parseIssueDueDate(issue),
      JSON.stringify((issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name))),
      JSON.stringify((issue.assignees || []).map((a) => a.login)),
      issue.pull_request ? 1 : 0,
      issue.html_url || null,
      remoteUpdated,
      ts,
      ts,
    ],
  );
  return id;
}

/**
 * GitHub issues have no native due date. Convention: a `due:YYYY-MM-DD` token
 * in the body, or a label like `due:2026-07-01`. Returns epoch ms or null.
 */
function parseIssueDueDate(issue) {
  const candidates = [];
  if (issue.body) candidates.push(issue.body);
  for (const l of issue.labels || []) candidates.push(typeof l === 'string' ? l : l.name);
  for (const text of candidates) {
    const m = /due:\s*(\d{4}-\d{2}-\d{2})/i.exec(text || '');
    if (m) {
      const t = Date.parse(`${m[1]}T00:00:00Z`);
      if (!Number.isNaN(t)) return t;
    }
  }
  return null;
}

async function listIssues(rId) {
  return await db().all('SELECT * FROM github_issues WHERE repo_id = ? AND is_pull_request = 0 ORDER BY number DESC', [rId]);
}

async function getIssue(id) {
  return await db().get('SELECT * FROM github_issues WHERE id = ?', [id]);
}

async function listDirtyIssues() {
  return await db().all('SELECT * FROM github_issues WHERE dirty = 1 AND is_pull_request = 0', []);
}

async function updateLocalIssue(id, patch) {
  const issue = await getIssue(id);
  if (!issue) return null;
  const ts = now();
  await db().run(
    `UPDATE github_issues SET title = ?, body = ?, state = ?,
      milestone_number = ?, labels = ?, assignees = ?,
      dome_updated_at = ?, dirty = 1, updated_at = ? WHERE id = ?`,
    [
      patch.title ?? issue.title,
      patch.body ?? issue.body,
      patch.state ?? issue.state,
      patch.milestoneNumber !== undefined ? patch.milestoneNumber : issue.milestone_number,
      patch.labels !== undefined ? JSON.stringify(patch.labels) : issue.labels,
      patch.assignees !== undefined ? JSON.stringify(patch.assignees) : issue.assignees,
      ts,
      ts,
      id,
    ],
  );
  return getIssue(id);
}

async function markIssueClean(id) {
  await db().run('UPDATE github_issues SET dirty = 0 WHERE id = ?', [id]);
}

// --- branches --------------------------------------------------------------

async function replaceBranches(rId, branches) {
  const ts = now();
  await db().transaction(async (tx) => {
    await tx.run('DELETE FROM github_branches WHERE repo_id = ?', [rId]);
    for (const b of branches) {
      const linked = /(?:^|[/-])(\d+)(?:[/-]|$)/.exec(b.name);
      // Plain INSERT (not INSERT OR REPLACE): the repo's branches were just
      // DELETEd above, so there is no conflict. DuckDB rejects INSERT OR REPLACE
      // here anyway — github_branches has two constraints (PK id + UNIQUE
      // repo_id,name) and DuckDB can't infer a conflict target for OR REPLACE.
      await tx.run(
        `INSERT INTO github_branches (id, repo_id, name, sha, protected, linked_issue_number, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [`ghb-${rId}-${slug(b.name)}`, rId, b.name, b.commit?.sha || null, b.protected ? 1 : 0, linked ? Number(linked[1]) : null, ts],
      );
    }
  });
}

async function listBranches(rId) {
  return await db().all('SELECT * FROM github_branches WHERE repo_id = ? ORDER BY name', [rId]);
}

// --- releases --------------------------------------------------------------

async function upsertRelease(rId, rel) {
  const ts = now();
  await db().run(
    `INSERT INTO github_releases (id, repo_id, remote_id, tag_name, name, body, published_at, html_url, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(repo_id, remote_id) DO UPDATE SET
       tag_name = excluded.tag_name, name = excluded.name, body = excluded.body,
       published_at = excluded.published_at, html_url = excluded.html_url, updated_at = excluded.updated_at`,
    [
      `ghrel-${rId}-${rel.id}`,
      rId,
      rel.id,
      rel.tag_name,
      rel.name || null,
      rel.body || null,
      rel.published_at ? Date.parse(rel.published_at) : null,
      rel.html_url || null,
      ts,
    ],
  );
}

async function listReleases(rId) {
  return await db().all('SELECT * FROM github_releases WHERE repo_id = ? ORDER BY published_at DESC', [rId]);
}

// --- calendar links --------------------------------------------------------

async function getCalendarLink(entityType, entityId) {
  return await db().get('SELECT * FROM github_calendar_links WHERE entity_type = ? AND entity_id = ?', [entityType, entityId]);
}

async function upsertCalendarLink(entityType, entityId, eventId) {
  const ts = now();
  await db().run(
    `INSERT INTO github_calendar_links (id, entity_type, entity_id, event_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(entity_type, entity_id) DO UPDATE SET event_id = excluded.event_id, updated_at = excluded.updated_at`,
    [`ghcl-${entityType}-${slug(entityId)}`, entityType, entityId, eventId, ts, ts],
  );
}

async function deleteCalendarLink(entityType, entityId) {
  await db().run('DELETE FROM github_calendar_links WHERE entity_type = ? AND entity_id = ?', [entityType, entityId]);
}

async function listAllCalendarLinkEventIds() {
  return (await db().all('SELECT event_id FROM github_calendar_links', [])).map((r) => r.event_id);
}

// --- full purge (on disconnect) -------------------------------------------

/** Wipe all GitHub data. Calendar events are deleted by the caller first. */
async function clearAllData() {
  await db().transaction(async (tx) => {
    for (const t of [
      'github_calendar_links',
      'github_sync_state',
      'github_releases',
      'github_branches',
      'github_issues',
      'github_milestones',
      'github_repos',
    ]) {
      await tx.run(`DELETE FROM ${t}`, []);
    }
  });
}

module.exports = {
  repoId,
  upsertRepo,
  listRepos,
  listSelectedRepos,
  getRepo,
  setRepoSelected,
  touchRepoSync,
  getEtag,
  setEtag,
  upsertMilestoneFromRemote,
  listMilestones,
  getMilestone,
  listDirtyMilestones,
  updateLocalMilestone,
  markMilestoneClean,
  upsertIssueFromRemote,
  listIssues,
  getIssue,
  listDirtyIssues,
  updateLocalIssue,
  markIssueClean,
  replaceBranches,
  listBranches,
  upsertRelease,
  listReleases,
  getCalendarLink,
  upsertCalendarLink,
  deleteCalendarLink,
  listAllCalendarLinkEventIds,
  clearAllData,
};