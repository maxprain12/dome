'use strict';

/* eslint-disable no-console */

/**
 * Orchestrates bidirectional GitHub ↔ Dome sync.
 *
 * syncNow() does, in order:
 *   1. push  — send locally-edited (dirty) milestones/issues to GitHub
 *   2. pull  — fetch milestones/issues/branches/releases (ETag-conditional)
 *   3. bridge — reproject dated entities into the Dome calendar
 *
 * Conflict policy: local-dirty-wins (push runs before pull, so a local edit is
 * written to GitHub and then confirmed by the pull). Simple and predictable for
 * a single-user desktop client without webhooks.
 */

const api = require('./github-api.cjs');
const store = require('./github-store.cjs');
const calendarBridge = require('./github-calendar-bridge.cjs');
const memoryMonitor = require('../core/memory-monitor.cjs');

let _syncing = false;
let _syncTimer = null;
let _pendingProjectId = undefined;
let _windowManager = null;

/** Coalesce rapid mutation-triggered syncs (IPC kickSync) into one run. */
const SYNC_COALESCE_MS = 800;

function init(windowManager) {
  _windowManager = windowManager;
}

function broadcast(channel, payload) {
  if (_windowManager?.broadcast) _windowManager.broadcast(channel, payload);
}

function scheduleSync(projectId) {
  if (projectId !== undefined && projectId !== null) {
    _pendingProjectId = store.normalizeProjectId(projectId);
  }
  if (_syncTimer) return;
  _syncTimer = setTimeout(() => {
    _syncTimer = null;
    const pid = _pendingProjectId;
    _pendingProjectId = undefined;
    void syncNowInternal(
      pid !== undefined ? { projectId: pid, notifyStatus: false } : { notifyStatus: false },
    ).catch((err) => {
      console.error('[github-sync] scheduled sync failed:', err?.message || err);
    });
  }, SYNC_COALESCE_MS);
}

function parseJsonArray(s) {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// --- repos -----------------------------------------------------------------

function mapRemoteCatalogEntry(remote) {
  return {
    id: remote.id,
    full_name: remote.full_name,
    name: remote.name,
    owner: remote.owner?.login || remote.owner || '',
    private: remote.private ? 1 : 0,
    html_url: remote.html_url || null,
  };
}

async function refreshRepos(projectId) {
  const pid = store.normalizeProjectId(projectId);
  const seen = new Set();
  const catalog = [];

  const ingestPage = (items) => {
    if (!Array.isArray(items)) return 0;
    let n = 0;
    for (const r of items) {
      if (seen.has(r.full_name)) continue;
      seen.add(r.full_name);
      store.updateRepoMetadataByFullName(r);
      catalog.push(mapRemoteCatalogEntry(r));
      n += 1;
    }
    return n;
  };

  await api.listReposStreamed({ onPage: ingestPage });

  try {
    const orgs = await api.listOrgs();
    for (const org of orgs.items || []) {
      try {
        await api.listOrgReposStreamed(org.login, { onPage: ingestPage });
      } catch (err) {
        console.warn(`[github-sync] org repos ${org.login} failed:`, err.message);
      }
    }
  } catch (err) {
    console.warn('[github-sync] list orgs failed:', err.message);
  }

  catalog.sort((a, b) => a.full_name.localeCompare(b.full_name));
  const tracked = store.listRepos(pid);
  const assignments = {};
  for (const row of store.listSelectedRepos()) {
    if (!assignments[row.full_name]) assignments[row.full_name] = [];
    if (!assignments[row.full_name].includes(row.project_id)) {
      assignments[row.full_name].push(row.project_id);
    }
  }

  return { catalog, tracked, assignments };
}

function setRepoSelected(payload) {
  const projectId = store.normalizeProjectId(payload?.projectId);
  const selected = !!payload?.selected;

  if (selected) {
    const remote = payload?.remote;
    if (!remote?.id || !remote?.full_name) throw new Error('Remote repo required to select');
    const existing = store.getRepoByFullNameAndProject(remote.full_name, projectId);
    const wasSelected = existing?.selected === 1;
    const id = store.upsertRepo(remote, projectId, { selected: true });
    return { repo: store.getRepo(id), syncNeeded: !wasSelected };
  }

  let repoId = payload?.repoId;
  if (typeof repoId !== 'string' && payload?.remote?.full_name) {
    const existing = store.getRepoByFullNameAndProject(payload.remote.full_name, projectId);
    repoId = existing?.id;
  }
  if (typeof repoId !== 'string') throw new Error('Invalid repoId');
  const repo = store.getRepo(repoId);
  const wasSelected = repo?.selected === 1;
  store.setRepoSelected(repoId, false, projectId);
  return { repo: store.getRepo(repoId), syncNeeded: wasSelected };
}

// --- pull ------------------------------------------------------------------

async function pullMilestones(repo, owner, name) {
  const etag = store.getEtag(repo.id, 'milestones');
  const res = await api.listMilestones(owner, name, { etag });
  if (!res.items) return;
  for (const m of res.items) store.upsertMilestoneFromRemote(repo.id, m);
  store.setEtag(repo.id, 'milestones', res.etag);
}

async function pullBranches(repo, owner, name) {
  const etag = store.getEtag(repo.id, 'branches');
  const res = await api.listBranches(owner, name, { etag });
  if (!res.items) return;
  store.replaceBranches(repo.id, res.items);
  store.setEtag(repo.id, 'branches', res.etag);
}

async function pullReleases(repo, owner, name) {
  const etag = store.getEtag(repo.id, 'releases');
  const res = await api.listReleases(owner, name, { etag });
  if (!res.items) return;
  for (const r of res.items) store.upsertRelease(repo.id, r);
  store.setEtag(repo.id, 'releases', res.etag);
}

async function pullIssues(repo, owner, name, sinceIso) {
  // Issues (includes PRs; the store flags is_pull_request).
  // STREAMED: a busy repo can return 10k+ issues with state=all; persisting
  // per page keeps main-process heap flat instead of accumulating the whole
  // array (root cause of the GitHub-pull OOM).
  // When last_sync_at exists, use GitHub ?since= for incremental updates.
  const issEtag = store.getEtag(repo.id, 'issues');
  let issueCount = 0;
  const iss = await api.listIssuesStreamed(owner, name, {
    etag: sinceIso ? undefined : issEtag,
    since: sinceIso || undefined,
    onPage: (items) => {
      for (const issue of items) store.upsertIssueFromRemote(repo.id, issue);
      issueCount += items.length;
      return items.length;
    },
  });
  if (iss.notModified) return;
  if (!sinceIso) {
    store.setEtag(repo.id, 'issues', iss.etag);
  }
  if (iss.pages > 0) {
    const mode = sinceIso ? 'incremental' : 'full';
    console.log(
      `[github-sync] pulled ${issueCount} issues (${mode}) from ${repo.full_name} (${iss.pages} page(s))`,
    );
  }
}

function computeSinceIso(repo) {
  // When last_sync_at exists, use GitHub ?since= for incremental updates.
  const lastSyncAt = repo.last_sync_at;
  return typeof lastSyncAt === 'number' && lastSyncAt > 0
    ? new Date(lastSyncAt - 60_000).toISOString()
    : null;
}

async function pullRepo(repo) {
  const [owner, name] = [repo.owner, repo.name];
  const sinceIso = computeSinceIso(repo);

  await pullMilestones(repo, owner, name);
  await pullIssues(repo, owner, name, sinceIso);
  await pullBranches(repo, owner, name);
  await pullReleases(repo, owner, name);

  store.touchRepoSync(repo.id);
}

// --- push ------------------------------------------------------------------

async function pushDirty() {
  for (const m of store.listDirtyMilestones()) {
    const repo = store.getRepo(m.repo_id);
    if (!repo) continue;
    try {
      await api.updateMilestone(repo.owner, repo.name, m.number, {
        title: m.title,
        description: m.description,
        dueOn: m.due_on ? new Date(m.due_on).toISOString() : null,
        state: m.state,
      });
      store.markMilestoneClean(m.id);
    } catch (err) {
      console.error(`[github-sync] push milestone ${repo.full_name}#${m.number} failed:`, err.message);
    }
  }

  for (const issue of store.listDirtyIssues()) {
    const repo = store.getRepo(issue.repo_id);
    if (!repo) continue;
    try {
      await api.updateIssue(repo.owner, repo.name, issue.number, {
        title: issue.title,
        body: issue.body,
        state: issue.state,
        milestone: issue.milestone_number ?? null,
        labels: parseJsonArray(issue.labels),
        assignees: parseJsonArray(issue.assignees),
      });
      store.markIssueClean(issue.id);
    } catch (err) {
      console.error(`[github-sync] push issue ${repo.full_name}#${issue.number} failed:`, err.message);
    }
  }
}

// --- create (explicit, renderer-driven) ------------------------------------

async function createIssue(repoId, { title, body, milestoneNumber, labels, assignees }) {
  const repo = store.getRepo(repoId);
  if (!repo) throw new Error('Repo not found');
  const created = await api.createIssue(repo.owner, repo.name, {
    title,
    body,
    milestone: milestoneNumber || undefined,
    labels,
    assignees,
  });
  store.upsertIssueFromRemote(repoId, created);
  return store.getIssue(`ghi-${repoId}-${created.number}`);
}

async function createMilestone(repoId, { title, description, dueOn, state }) {
  const repo = store.getRepo(repoId);
  if (!repo) throw new Error('Repo not found');
  const created = await api.createMilestone(repo.owner, repo.name, {
    title,
    description,
    dueOn: dueOn ? new Date(dueOn).toISOString() : undefined,
    state,
  });
  store.upsertMilestoneFromRemote(repoId, created);
  return store.getMilestone(`ghm-${repoId}-${created.number}`);
}

function requireIssueRepo(issueId) {
  const issue = store.getIssue(issueId);
  if (!issue) throw new Error('Issue not found');
  const repo = store.getRepo(issue.repo_id);
  if (!repo) throw new Error('Repo not found');
  return { issue, repo };
}

function mapIssueComment(remote) {
  return {
    id: remote.id,
    body: remote.body || '',
    user: remote.user?.login ?? null,
    user_avatar: remote.user?.avatar_url ?? null,
    created_at: remote.created_at ? Date.parse(remote.created_at) : null,
    updated_at: remote.updated_at ? Date.parse(remote.updated_at) : null,
    html_url: remote.html_url ?? null,
  };
}

async function listIssueComments(issueId) {
  const { issue, repo } = requireIssueRepo(issueId);
  const res = await api.listIssueComments(repo.owner, repo.name, issue.number);
  return (res.items || []).map(mapIssueComment);
}

async function createIssueComment(issueId, body) {
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) throw new Error('Comment body is required');
  const { issue, repo } = requireIssueRepo(issueId);
  const created = await api.createIssueComment(repo.owner, repo.name, issue.number, text);
  return mapIssueComment(created);
}

/** Significant timeline events (closed/reopened, linked & cross-referenced PRs, mentions, …). */
const TIMELINE_EVENTS = new Set([
  'closed', 'reopened', 'merged', 'referenced', 'cross-referenced',
  'connected', 'disconnected', 'mentioned', 'assigned', 'unassigned',
  'labeled', 'unlabeled', 'renamed', 'milestoned', 'demilestoned',
  'review_requested', 'head_ref_deleted', 'head_ref_force_pushed',
]);

function timelineSourceFromEvent(ev) {
  const src = ev.source;
  if (!src) return null;
  const issue = src.issue ?? (src.number ? src : null);
  if (!issue?.number) return null;
  const pr = issue.pull_request ?? src.pull_request;
  return {
    number: issue.number,
    title: issue.title || '',
    html_url: issue.html_url || '',
    state: issue.state || '',
    is_pull_request: Boolean(pr),
    merged: Boolean(pr?.merged_at),
  };
}

function mapTimelineEvent(ev) {
  const source = timelineSourceFromEvent(ev);
  return {
    id: ev.id ?? ev.node_id ?? `${ev.event}-${ev.created_at}`,
    event: ev.event,
    actor: ev.actor?.login ?? ev.user?.login ?? null,
    actor_avatar: ev.actor?.avatar_url ?? ev.user?.avatar_url ?? null,
    created_at: ev.created_at ? Date.parse(ev.created_at) : null,
    label: ev.label?.name ?? null,
    rename: ev.rename ? { from: ev.rename.from, to: ev.rename.to } : null,
    commit_id: ev.commit_id ?? null,
    state_reason: ev.state_reason ?? null,
    source,
  };
}

async function listIssueTimeline(issueId) {
  const { issue, repo } = requireIssueRepo(issueId);
  const res = await api.listIssueTimeline(repo.owner, repo.name, issue.number);
  return (res.items || [])
    .filter((ev) => TIMELINE_EVENTS.has(ev.event))
    .map(mapTimelineEvent);
}

async function listMentionableUsers(issueId) {
  const { repo } = requireIssueRepo(issueId);
  const [assignees, collaborators] = await Promise.all([
    api.listMentionableUsers(repo.owner, repo.name),
    api.listCollaborators(repo.owner, repo.name).catch(() => ({ items: [] })),
  ]);
  const byLogin = new Map();
  for (const u of [...(assignees.items || []), ...(collaborators.items || [])]) {
    if (u?.login) byLogin.set(u.login, { login: u.login, avatar_url: u.avatar_url ?? null });
  }
  return [...byLogin.values()].sort((a, b) => a.login.localeCompare(b.login));
}

// --- top-level -------------------------------------------------------------

function filterReposByProject(repos, projectId) {
  if (projectId === undefined || projectId === null) return repos;
  const pid = store.normalizeProjectId(projectId);
  return repos.filter((r) => store.normalizeProjectId(r.project_id) === pid);
}

async function syncNowInternal(opts = {}) {
  const notifyStatus = opts.notifyStatus !== false;
  if (_syncing) {
    scheduleSync(opts.projectId);
    return { success: false, error: 'Sync already in progress' };
  }
  _syncing = true;
  if (notifyStatus) broadcast('github:sync:status', { status: 'syncing' });
  try {
    await pushDirty();
    const repos = filterReposByProject(store.listSelectedRepos(), opts.projectId);
    for (const repo of repos) {
      await pullRepo(repo);
    }
    const lastSync = Date.now();
    if (notifyStatus) {
      broadcast('github:sync:status', { status: 'idle', lastSync });
    }
    broadcast('github:data:updated', {});

    // Calendar projection must not block sync status / UI refresh.
    if (!memoryMonitor.isMemoryPressureHigh()) {
      void calendarBridge.syncCalendar(repos).catch((err) => {
        console.warn('[github-sync] calendar projection failed:', err.message);
      });
    } else {
      console.warn('[github-sync] skipping calendar projection — memory pressure');
    }

    return { success: true, repos: repos.length };
  } catch (err) {
    console.error('[github-sync] syncNow failed:', err.message);
    if (notifyStatus) broadcast('github:sync:status', { status: 'error', error: err.message });
    return { success: false, error: err.message };
  } finally {
    _syncing = false;
  }
}

/** Immediate sync (manual button). Optional projectId scopes to one vault. */
async function syncNow(opts = {}) {
  if (_syncTimer) {
    clearTimeout(_syncTimer);
    _syncTimer = null;
    _pendingProjectId = undefined;
  }
  return syncNowInternal(opts);
}

/** Remove all local GitHub data + calendar projection (called on disconnect). */
async function purgeAllData() {
  try {
    await calendarBridge.purgeAllEvents();
  } catch (err) {
    console.error('[github-sync] purge calendar failed:', err.message);
  }
  store.clearAllData();
  broadcast('github:data:updated', {});
}

module.exports = {
  init,
  refreshRepos,
  setRepoSelected,
  scheduleSync,
  syncNow,
  pullRepo,
  createIssue,
  createMilestone,
  listIssueComments,
  createIssueComment,
  listIssueTimeline,
  listMentionableUsers,
  purgeAllData,
};
