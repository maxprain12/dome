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

let _syncing = false;
let _windowManager = null;

function init(windowManager) {
  _windowManager = windowManager;
}

function broadcast(channel, payload) {
  if (_windowManager?.broadcast) _windowManager.broadcast(channel, payload);
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

async function refreshRepos() {
  const seen = new Set();
  const upsertAll = (items) => {
    if (!Array.isArray(items)) return 0;
    let n = 0;
    for (const r of items) {
      if (seen.has(r.full_name)) continue;
      seen.add(r.full_name);
      store.upsertRepo(r);
      n += 1;
    }
    return n;
  };

  // 1. Repos affiliated with the user (owner / collaborator / org member).
  //    Streamed + persisted per page so a user in many orgs (thousands of
  //    repos) doesn't accumulate the whole list in main-process heap.
  await api.listReposStreamed({ onPage: upsertAll });

  // 2. Explicitly pull each org's repos — /user/repos can omit org repos when
  //    the org has third-party access restrictions or many repos.
  try {
    const orgs = await api.listOrgs();
    for (const org of orgs.items || []) {
      try {
        await api.listOrgReposStreamed(org.login, { onPage: upsertAll });
      } catch (err) {
        console.warn(`[github-sync] org repos ${org.login} failed:`, err.message);
      }
    }
  } catch (err) {
    console.warn('[github-sync] list orgs failed:', err.message);
  }

  return store.listRepos();
}

function setRepoSelected(repoId, selected) {
  store.setRepoSelected(repoId, selected);
  return store.getRepo(repoId);
}

// --- pull ------------------------------------------------------------------

async function pullRepo(repo) {
  const [owner, name] = [repo.owner, repo.name];

  // Milestones — small endpoint, capped getAllPages is fine.
  const msEtag = store.getEtag(repo.id, 'milestones');
  const ms = await api.listMilestones(owner, name, { etag: msEtag });
  if (ms.items) {
    for (const m of ms.items) store.upsertMilestoneFromRemote(repo.id, m);
    store.setEtag(repo.id, 'milestones', ms.etag);
  }

  // Issues (includes PRs; the store flags is_pull_request).
  // STREAMED: a busy repo can return 10k+ issues with state=all; persisting
  // per page keeps main-process heap flat instead of accumulating the whole
  // array (root cause of the GitHub-pull OOM).
  const issEtag = store.getEtag(repo.id, 'issues');
  let issueCount = 0;
  const iss = await api.listIssuesStreamed(owner, name, {
    etag: issEtag,
    onPage: (items) => {
      for (const issue of items) store.upsertIssueFromRemote(repo.id, issue);
      issueCount += items.length;
      return items.length;
    },
  });
  if (!iss.notModified) {
    store.setEtag(repo.id, 'issues', iss.etag);
    if (iss.pages > 0) {
      // streamPages already warns if the maxPages safety cap was hit.
      console.log(`[github-sync] pulled ${issueCount} issues from ${repo.full_name} (${iss.pages} page(s))`);
    }
  }

  // Branches
  const brEtag = store.getEtag(repo.id, 'branches');
  const br = await api.listBranches(owner, name, { etag: brEtag });
  if (br.items) {
    store.replaceBranches(repo.id, br.items);
    store.setEtag(repo.id, 'branches', br.etag);
  }

  // Releases
  const relEtag = store.getEtag(repo.id, 'releases');
  const rel = await api.listReleases(owner, name, { etag: relEtag });
  if (rel.items) {
    for (const r of rel.items) store.upsertRelease(repo.id, r);
    store.setEtag(repo.id, 'releases', rel.etag);
  }

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

async function syncNow() {
  if (_syncing) return { success: false, error: 'Sync already in progress' };
  _syncing = true;
  broadcast('github:sync:status', { status: 'syncing' });
  try {
    await pushDirty();
    const repos = store.listSelectedRepos();
    for (const repo of repos) {
      await pullRepo(repo);
    }
    await calendarBridge.syncCalendar();
    broadcast('github:sync:status', { status: 'idle', lastSync: Date.now() });
    broadcast('github:data:updated', {});
    return { success: true, repos: repos.length };
  } catch (err) {
    console.error('[github-sync] syncNow failed:', err.message);
    broadcast('github:sync:status', { status: 'error', error: err.message });
    return { success: false, error: err.message };
  } finally {
    _syncing = false;
  }
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
