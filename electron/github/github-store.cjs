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

function normalizeProjectId(projectId) {
  const pid = typeof projectId === 'string' && projectId.trim() ? projectId.trim() : 'default';
  return pid;
}

// --- repos -----------------------------------------------------------------

function repoId(remoteId, projectId) {
  return `ghr-${remoteId}-${slug(normalizeProjectId(projectId))}`;
}

function upsertRepo(remote, projectId, { selected } = {}) {
  const pid = normalizeProjectId(projectId);
  const id = repoId(remote.id, pid);
  const ts = now();
  const existing = db().prepare('SELECT selected FROM github_repos WHERE id = ?').get(id);
  const selectedVal = selected !== undefined ? (selected ? 1 : 0) : (existing?.selected ?? 0);
  db()
    .prepare(
      `INSERT INTO github_repos
        (id, remote_id, owner, name, full_name, private, html_url, selected, project_id, created_at, updated_at)
       VALUES (@id, @remote_id, @owner, @name, @full_name, @private, @html_url, @selected, @project_id, @ts, @ts)
       ON CONFLICT(full_name, project_id) DO UPDATE SET
         owner = excluded.owner, name = excluded.name, private = excluded.private,
         html_url = excluded.html_url,
         selected = CASE WHEN @selected_explicit = 1 THEN excluded.selected ELSE github_repos.selected END,
         updated_at = excluded.updated_at`,
    )
    .run({
      id,
      remote_id: remote.id,
      owner: remote.owner?.login || remote.owner || '',
      name: remote.name,
      full_name: remote.full_name,
      private: remote.private ? 1 : 0,
      html_url: remote.html_url || null,
      selected: selectedVal,
      project_id: pid,
      selected_explicit: selected !== undefined ? 1 : 0,
      ts,
    });
  return id;
}

/** Update metadata on every tracked row sharing this full_name (multi-vault). */
function updateRepoMetadataByFullName(remote) {
  if (!remote?.full_name) return 0;
  const ts = now();
  const res = db()
    .prepare(
      `UPDATE github_repos SET owner = @owner, name = @name, private = @private, html_url = @html_url, updated_at = @ts
       WHERE full_name = @full_name`,
    )
    .run({
      owner: remote.owner?.login || remote.owner || '',
      name: remote.name,
      private: remote.private ? 1 : 0,
      html_url: remote.html_url || null,
      full_name: remote.full_name,
      ts,
    });
  return res.changes;
}

function listRepos(projectId) {
  const pid = normalizeProjectId(projectId);
  return db().prepare('SELECT * FROM github_repos WHERE project_id = ? ORDER BY full_name').all(pid);
}

function listSelectedRepos() {
  return db().prepare('SELECT * FROM github_repos WHERE selected = 1 ORDER BY full_name, project_id').all();
}

function getRepo(id) {
  return db().prepare('SELECT * FROM github_repos WHERE id = ?').get(id);
}

function getRepoByFullNameAndProject(fullName, projectId) {
  return db()
    .prepare('SELECT * FROM github_repos WHERE full_name = ? AND project_id = ?')
    .get(fullName, normalizeProjectId(projectId));
}

function findAssignmentsByFullName(fullName) {
  return db()
    .prepare('SELECT project_id FROM github_repos WHERE full_name = ? AND selected = 1 ORDER BY project_id')
    .all(fullName)
    .map((r) => r.project_id);
}

function setRepoSelected(id, selected, projectId) {
  const pid = normalizeProjectId(projectId);
  const repo = getRepo(id);
  if (!repo || repo.project_id !== pid) {
    throw new Error('Repo not found in this vault');
  }
  db()
    .prepare('UPDATE github_repos SET selected = ?, updated_at = ? WHERE id = ? AND project_id = ?')
    .run(selected ? 1 : 0, now(), id, pid);
}

function touchRepoSync(id) {
  db().prepare('UPDATE github_repos SET last_sync_at = ? WHERE id = ?').run(now(), id);
}

// --- sync state (ETags) ----------------------------------------------------

function getEtag(rId, resource) {
  return db().prepare('SELECT etag FROM github_sync_state WHERE repo_id = ? AND resource = ?').get(rId, resource)?.etag || null;
}

function setEtag(rId, resource, etag) {
  const ts = now();
  db()
    .prepare(
      `INSERT INTO github_sync_state (id, repo_id, resource, etag, last_synced_at)
       VALUES (@id, @repo_id, @resource, @etag, @ts)
       ON CONFLICT(repo_id, resource) DO UPDATE SET etag = excluded.etag, last_synced_at = excluded.last_synced_at`,
    )
    .run({ id: `ghs-${rId}-${resource}`, repo_id: rId, resource, etag: etag || null, ts });
}

// --- milestones ------------------------------------------------------------

function milestoneId(rId, number) {
  return `ghm-${rId}-${number}`;
}

function upsertMilestoneFromRemote(rId, m) {
  const id = milestoneId(rId, m.number);
  const ts = now();
  const remoteUpdated = m.updated_at ? Date.parse(m.updated_at) : ts;
  db()
    .prepare(
      `INSERT INTO github_milestones
        (id, repo_id, number, title, description, due_on, state, open_issues, closed_issues, html_url, closed_at, remote_updated_at, dome_updated_at, dirty, created_at, updated_at)
       VALUES (@id, @repo_id, @number, @title, @description, @due_on, @state, @open_issues, @closed_issues, @html_url, @closed_at, @remote_updated_at, NULL, 0, @ts, @ts)
       ON CONFLICT(repo_id, number) DO UPDATE SET
         title = excluded.title, description = excluded.description, due_on = excluded.due_on,
         state = excluded.state, open_issues = excluded.open_issues, closed_issues = excluded.closed_issues,
         html_url = excluded.html_url, closed_at = excluded.closed_at, remote_updated_at = excluded.remote_updated_at,
         dirty = 0, updated_at = excluded.updated_at`,
    )
    .run({
      id,
      repo_id: rId,
      number: m.number,
      title: m.title,
      description: m.description || null,
      due_on: m.due_on ? Date.parse(m.due_on) : null,
      state: m.state === 'closed' ? 'closed' : 'open',
      open_issues: m.open_issues || 0,
      closed_issues: m.closed_issues || 0,
      html_url: m.html_url || null,
      closed_at: m.closed_at ? Date.parse(m.closed_at) : null,
      remote_updated_at: remoteUpdated,
      ts,
    });
  return id;
}

function listMilestones(rId) {
  return db().prepare('SELECT * FROM github_milestones WHERE repo_id = ? ORDER BY due_on IS NULL, due_on').all(rId);
}

/** Metadata-only list for IPC/UI — excludes `description`. */
function listMilestonesSummary(rId) {
  return db()
    .prepare(
      `SELECT id, repo_id, number, title, due_on, closed_at, state, open_issues, closed_issues, html_url,
              remote_updated_at, dome_updated_at, dirty, created_at, updated_at
       FROM github_milestones WHERE repo_id = ? ORDER BY due_on IS NULL, due_on`,
    )
    .all(rId);
}

/** Milestones with a due date — for calendar projection (includes description). */
function listMilestonesWithDueOn(rId) {
  return db()
    .prepare('SELECT * FROM github_milestones WHERE repo_id = ? AND due_on IS NOT NULL ORDER BY due_on')
    .all(rId);
}

function getMilestone(id) {
  return db().prepare('SELECT * FROM github_milestones WHERE id = ?').get(id);
}

function listDirtyMilestones() {
  return db().prepare('SELECT * FROM github_milestones WHERE dirty = 1').all();
}

/** Apply a local edit (renderer-driven), marking the row dirty for push. */
function updateLocalMilestone(id, patch) {
  const m = getMilestone(id);
  if (!m) return { milestone: null, changed: false };
  const nextTitle = patch.title ?? m.title;
  const nextDescription = patch.description !== undefined ? patch.description : m.description;
  const nextDueOn = patch.dueOn !== undefined ? patch.dueOn : m.due_on;
  const nextState = patch.state ?? m.state;
  const unchanged =
    nextTitle === m.title &&
    nextDescription === m.description &&
    nextDueOn === m.due_on &&
    nextState === m.state;
  if (unchanged) return { milestone: m, changed: false };

  const ts = now();
  db()
    .prepare(
      `UPDATE github_milestones SET title = @title, description = @description, due_on = @due_on,
        state = @state, dome_updated_at = @ts, dirty = 1, updated_at = @ts WHERE id = @id`,
    )
    .run({
      id,
      title: nextTitle,
      description: nextDescription,
      due_on: nextDueOn,
      state: nextState,
      ts,
    });
  return { milestone: getMilestone(id), changed: true };
}

function markMilestoneClean(id) {
  db().prepare('UPDATE github_milestones SET dirty = 0 WHERE id = ?').run(id);
}

// --- issues ----------------------------------------------------------------

function issueId(rId, number) {
  return `ghi-${rId}-${number}`;
}

function upsertIssueFromRemote(rId, issue) {
  const id = issueId(rId, issue.number);
  const ts = now();
  const remoteUpdated = issue.updated_at ? Date.parse(issue.updated_at) : ts;
  db()
    .prepare(
      `INSERT INTO github_issues
        (id, repo_id, number, title, body, state, milestone_number, due_date, labels, assignees, is_pull_request, html_url, remote_updated_at, dome_updated_at, dirty, created_at, updated_at)
       VALUES (@id, @repo_id, @number, @title, @body, @state, @milestone_number, @due_date, @labels, @assignees, @is_pr, @html_url, @remote_updated_at, NULL, 0, @ts, @ts)
       ON CONFLICT(repo_id, number) DO UPDATE SET
         title = excluded.title, body = excluded.body, state = excluded.state,
         milestone_number = excluded.milestone_number, due_date = excluded.due_date,
         labels = excluded.labels, assignees = excluded.assignees, is_pull_request = excluded.is_pull_request,
         html_url = excluded.html_url, remote_updated_at = excluded.remote_updated_at,
         dirty = 0, updated_at = excluded.updated_at`,
    )
    .run({
      id,
      repo_id: rId,
      number: issue.number,
      title: issue.title,
      body: issue.body || null,
      state: issue.state === 'closed' ? 'closed' : 'open',
      milestone_number: issue.milestone?.number ?? null,
      due_date: parseIssueDueDate(issue),
      labels: JSON.stringify((issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name))),
      assignees: JSON.stringify((issue.assignees || []).map((a) => a.login)),
      is_pr: issue.pull_request ? 1 : 0,
      html_url: issue.html_url || null,
      remote_updated_at: remoteUpdated,
      ts,
    });
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

function listIssues(rId) {
  return db().prepare('SELECT * FROM github_issues WHERE repo_id = ? AND is_pull_request = 0 ORDER BY number DESC').all(rId);
}

/** Metadata-only list for IPC/UI — excludes `body` to avoid OOM on large repos. */
const ISSUE_LIST_DEFAULT_LIMIT = 5000;
const ISSUE_LIST_MAX_LIMIT = 8000;

function listIssuesSummary(rId, opts = {}) {
  const state = opts.state === 'open' || opts.state === 'closed' ? opts.state : null;
  const limit = Math.min(
    Math.max(1, Number.isFinite(opts.limit) ? opts.limit : ISSUE_LIST_DEFAULT_LIMIT),
    ISSUE_LIST_MAX_LIMIT,
  );
  const offset = Math.max(0, Number.isFinite(opts.offset) ? opts.offset : 0);

  let sql = `SELECT id, repo_id, number, title, state, milestone_number, due_date, labels, assignees, is_pull_request, html_url
       FROM github_issues WHERE repo_id = ? AND is_pull_request = 0`;
  const params = [rId];
  if (state) {
    sql += ' AND state = ?';
    params.push(state);
  }
  sql += ' ORDER BY number DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return db().prepare(sql).all(...params);
}

function countIssues(rId, state) {
  if (state === 'open' || state === 'closed') {
    return db()
      .prepare(
        'SELECT COUNT(*) AS count FROM github_issues WHERE repo_id = ? AND is_pull_request = 0 AND state = ?',
      )
      .get(rId, state).count;
  }
  return db()
    .prepare('SELECT COUNT(*) AS count FROM github_issues WHERE repo_id = ? AND is_pull_request = 0')
    .get(rId).count;
}

/** Open issues with a parsed due date — for calendar projection (includes body). */
function listIssuesForCalendar(rId) {
  return db()
    .prepare(
      `SELECT id, repo_id, number, title, body, state, due_date, html_url
       FROM github_issues
       WHERE repo_id = ? AND is_pull_request = 0 AND state = 'open' AND due_date IS NOT NULL`,
    )
    .all(rId);
}

function getIssue(id) {
  return db().prepare('SELECT * FROM github_issues WHERE id = ?').get(id);
}

function listDirtyIssues() {
  return db().prepare('SELECT * FROM github_issues WHERE dirty = 1 AND is_pull_request = 0').all();
}

function updateLocalIssue(id, patch) {
  const issue = getIssue(id);
  if (!issue) return { issue: null, changed: false };
  const nextTitle = patch.title ?? issue.title;
  const nextBody = patch.body ?? issue.body;
  const nextState = patch.state ?? issue.state;
  const nextMilestone =
    patch.milestoneNumber !== undefined ? patch.milestoneNumber : issue.milestone_number;
  const nextLabels =
    patch.labels !== undefined ? JSON.stringify(patch.labels) : issue.labels;
  const nextAssignees =
    patch.assignees !== undefined ? JSON.stringify(patch.assignees) : issue.assignees;
  const unchanged =
    nextTitle === issue.title &&
    nextBody === issue.body &&
    nextState === issue.state &&
    nextMilestone === issue.milestone_number &&
    nextLabels === issue.labels &&
    nextAssignees === issue.assignees;
  if (unchanged) return { issue, changed: false };

  const ts = now();
  db()
    .prepare(
      `UPDATE github_issues SET title = @title, body = @body, state = @state,
        milestone_number = @milestone_number, labels = @labels, assignees = @assignees,
        dome_updated_at = @ts, dirty = 1, updated_at = @ts WHERE id = @id`,
    )
    .run({
      id,
      title: nextTitle,
      body: nextBody,
      state: nextState,
      milestone_number: nextMilestone,
      labels: nextLabels,
      assignees: nextAssignees,
      ts,
    });
  return { issue: getIssue(id), changed: true };
}

function markIssueClean(id) {
  db().prepare('UPDATE github_issues SET dirty = 0 WHERE id = ?').run(id);
}

// --- branches --------------------------------------------------------------

function replaceBranches(rId, branches) {
  const ts = now();
  const tx = db().transaction(() => {
    db().prepare('DELETE FROM github_branches WHERE repo_id = ?').run(rId);
    const stmt = db().prepare(
      `INSERT OR REPLACE INTO github_branches (id, repo_id, name, sha, protected, linked_issue_number, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const b of branches) {
      const linked = /(?:^|[/-])(\d+)(?:[/-]|$)/.exec(b.name);
      stmt.run(`ghb-${rId}-${slug(b.name)}`, rId, b.name, b.commit?.sha || null, b.protected ? 1 : 0, linked ? Number(linked[1]) : null, ts);
    }
  });
  tx();
}

function listBranches(rId) {
  return db().prepare('SELECT * FROM github_branches WHERE repo_id = ? ORDER BY name').all(rId);
}

// --- releases --------------------------------------------------------------

function upsertRelease(rId, rel) {
  const ts = now();
  db()
    .prepare(
      `INSERT INTO github_releases (id, repo_id, remote_id, tag_name, name, body, published_at, html_url, updated_at)
       VALUES (@id, @repo_id, @remote_id, @tag_name, @name, @body, @published_at, @html_url, @ts)
       ON CONFLICT(repo_id, remote_id) DO UPDATE SET
         tag_name = excluded.tag_name, name = excluded.name, body = excluded.body,
         published_at = excluded.published_at, html_url = excluded.html_url, updated_at = excluded.updated_at`,
    )
    .run({
      id: `ghrel-${rId}-${rel.id}`,
      repo_id: rId,
      remote_id: rel.id,
      tag_name: rel.tag_name,
      name: rel.name || null,
      body: rel.body || null,
      published_at: rel.published_at ? Date.parse(rel.published_at) : null,
      html_url: rel.html_url || null,
      ts,
    });
}

function listReleases(rId) {
  return db().prepare('SELECT * FROM github_releases WHERE repo_id = ? ORDER BY published_at DESC').all(rId);
}

// --- calendar links --------------------------------------------------------

function getCalendarLink(entityType, entityId) {
  return db().prepare('SELECT * FROM github_calendar_links WHERE entity_type = ? AND entity_id = ?').get(entityType, entityId);
}

function upsertCalendarLink(entityType, entityId, eventId) {
  const ts = now();
  db()
    .prepare(
      `INSERT INTO github_calendar_links (id, entity_type, entity_id, event_id, created_at, updated_at)
       VALUES (@id, @entity_type, @entity_id, @event_id, @ts, @ts)
       ON CONFLICT(entity_type, entity_id) DO UPDATE SET event_id = excluded.event_id, updated_at = excluded.updated_at`,
    )
    .run({ id: `ghcl-${entityType}-${slug(entityId)}`, entity_type: entityType, entity_id: entityId, event_id: eventId, ts });
}

function deleteCalendarLink(entityType, entityId) {
  db().prepare('DELETE FROM github_calendar_links WHERE entity_type = ? AND entity_id = ?').run(entityType, entityId);
}

function listAllCalendarLinkEventIds() {
  return db().prepare('SELECT event_id FROM github_calendar_links').all().map((r) => r.event_id);
}

function listGithubCalendarIds() {
  return db()
    .prepare("SELECT id FROM calendar_calendars WHERE id = 'github-default' OR id LIKE 'github-%'")
    .all()
    .map((r) => r.id);
}

// --- full purge (on disconnect) -------------------------------------------

/** Wipe all GitHub data. Calendar events are deleted by the caller first. */
function clearAllData() {
  const tx = db().transaction(() => {
    for (const t of [
      'github_calendar_links',
      'github_sync_state',
      'github_releases',
      'github_branches',
      'github_issues',
      'github_milestones',
      'github_repos',
    ]) {
      db().prepare(`DELETE FROM ${t}`).run();
    }
  });
  tx();
}

module.exports = {
  normalizeProjectId,
  repoId,
  upsertRepo,
  updateRepoMetadataByFullName,
  listRepos,
  listSelectedRepos,
  getRepo,
  getRepoByFullNameAndProject,
  findAssignmentsByFullName,
  setRepoSelected,
  touchRepoSync,
  getEtag,
  setEtag,
  upsertMilestoneFromRemote,
  listMilestones,
  listMilestonesSummary,
  listMilestonesWithDueOn,
  getMilestone,
  listDirtyMilestones,
  updateLocalMilestone,
  markMilestoneClean,
  upsertIssueFromRemote,
  listIssues,
  listIssuesSummary,
  listIssuesForCalendar,
  countIssues,
  ISSUE_LIST_DEFAULT_LIMIT,
  ISSUE_LIST_MAX_LIMIT,
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
  listGithubCalendarIds,
  clearAllData,
};
