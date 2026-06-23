'use strict';

/* eslint-disable no-console */

/**
 * Authenticated GitHub REST client for the project-sync feature.
 *
 * Uses the OAuth token from github-oauth.cjs. Handles pagination, rate-limit
 * back-off and conditional requests (ETag) so the sync scheduler stays well
 * under the 5000 req/h authenticated budget.
 *
 * This is intentionally separate from marketplace/github-client.cjs (which is
 * unauthenticated and marketplace-specific) to avoid coupling the two.
 */

const githubOAuth = require('../auth/github-oauth.cjs');

const API_BASE = 'https://api.github.com';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000;

// Safety cap on how many pages a single getAllPages/streamPages call may walk
// before bailing out. At per_page=100 this is up to 50k items — far above any
// sane single-resource request, but prevents an unbounded loop from blowing
// up the main-process heap (root cause of the GitHub-pull OOM; see
// github-sync-scheduler.cjs). Callers that genuinely need more should switch
// to the streamed variant below and persist per page.
const MAX_PAGES = 500;

function requireToken() {
  const token = githubOAuth.getToken();
  if (!token) {
    throw new Error('GitHub no conectado. Conéctalo en Ajustes → GitHub.');
  }
  return token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Low-level request. Returns { status, headers, data }.
 * On 304 (ETag match) returns data:null so callers can keep their cache.
 */
async function rawRequest(method, path, { body, etag, token } = {}, retries = MAX_RETRIES, backoff = INITIAL_BACKOFF) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': githubOAuth.USER_AGENT,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (etag) headers['If-None-Match'] = etag;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });

  // Primary/secondary rate limit handling.
  if ((res.status === 403 || res.status === 429) && retries > 0) {
    const remaining = parseInt(res.headers.get('x-ratelimit-remaining') || '1', 10);
    const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
    const reset = parseInt(res.headers.get('x-ratelimit-reset') || '0', 10);
    if (remaining <= 0 || retryAfter > 0) {
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.max(0, reset * 1000 - Date.now()) + 1000;
      console.warn(`[github-api] rate limited, waiting ${waitMs}ms`);
      await sleep(Math.min(waitMs, 60_000));
      return rawRequest(method, path, { body, etag, token }, retries - 1, backoff);
    }
  }

  if (res.status === 304) {
    return { status: 304, headers: res.headers, data: null };
  }

  if (res.status >= 200 && res.status < 300) {
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, headers: res.headers, data };
  }

  if (res.status >= 500 && retries > 0) {
    await sleep(backoff);
    return rawRequest(method, path, { body, etag, token }, retries - 1, backoff * 2);
  }

  const errText = await res.text().catch(() => '');
  let message = `GitHub ${res.status}`;
  try {
    message = JSON.parse(errText).message || message;
  } catch {
    /* keep default */
  }
  throw new Error(message);
}

/** GET with automatic pagination (follows the Link rel="next" header).
 *  Caps at `maxPages` (default MAX_PAGES) to keep main-process heap bounded;
 *  use streamPages() for the few endpoints whose true page count may exceed
 *  the cap (issues, user/org repos). */
async function getAllPages(path, { etag, maxPages = MAX_PAGES } = {}) {
  const token = requireToken();
  const sep = path.includes('?') ? '&' : '?';
  let next = `${path}${sep}per_page=100`;
  const all = [];
  let firstEtag = null;
  let first = true;
  let pages = 0;

  while (next) {
    if (pages >= maxPages) {
      console.warn(`[github-api] getAllPages hit maxPages=${maxPages} cap at ${path} (collected ${all.length} items)`);
      break;
    }
    const res = await rawRequest('GET', next, { token, etag: first ? etag : undefined });
    if (first) {
      firstEtag = res.headers.get('etag');
      first = false;
      if (res.status === 304) return { items: null, etag };
    }
    if (Array.isArray(res.data)) all.push(...res.data);
    const link = res.headers.get('link') || '';
    const m = /<([^>]+)>;\s*rel="next"/.exec(link);
    next = m ? m[1] : null;
    pages += 1;
  }
  return { items: all, etag: firstEtag };
}

/**
 * Streaming variant of getAllPages: invokes `onPage(items, pageInfo)` once per
 * fetched page and does NOT accumulate anything in memory. Peak memory is ~one
 * page (100 items) regardless of how many pages the endpoint returns.
 *
 * Returns { etag, pages, total } (total = sum of onPage return values if
 * numbers, else 0) so callers can report progress. Stops at `maxPages`.
 *
 * Use this for endpoints that can return thousands of items per repo:
 *   - listIssues (state=all includes PRs → can be 10k+)
 *   - listRepos / listOrgRepos (user in many orgs → thousands)
 * The small per-issue endpoints (milestones, branches, releases, comments,
 * timeline, mentionables) keep using getAllPages with its cap.
 */
async function streamPages(path, { etag, maxPages = MAX_PAGES, onPage } = {}) {
  const token = requireToken();
  const sep = path.includes('?') ? '&' : '?';
  let next = `${path}${sep}per_page=100`;
  let firstEtag = null;
  let first = true;
  let pages = 0;
  let total = 0;

  while (next) {
    if (pages >= maxPages) {
      console.warn(`[github-api] streamPages hit maxPages=${maxPages} cap at ${path}`);
      break;
    }
    const res = await rawRequest('GET', next, { token, etag: first ? etag : undefined });
    if (first) {
      firstEtag = res.headers.get('etag');
      first = false;
      if (res.status === 304) return { etag, pages, total, notModified: true };
    }
    const items = Array.isArray(res.data) ? res.data : [];
    if (typeof onPage === 'function') {
      const r = onPage(items, { page: pages });
      if (typeof r === 'number') total += r;
    }
    const link = res.headers.get('link') || '';
    const m = /<([^>]+)>;\s*rel="next"/.exec(link);
    next = m ? m[1] : null;
    pages += 1;
  }
  return { etag: firstEtag, pages, total, notModified: false };
}

async function get(path) {
  const token = requireToken();
  const res = await rawRequest('GET', path, { token });
  return res.data;
}

async function mutate(method, path, body) {
  const token = requireToken();
  const res = await rawRequest(method, path, { token, body });
  return res.data;
}

// ---------------------------------------------------------------------------
// High-level endpoints
// ---------------------------------------------------------------------------

/** Repos the authenticated user can push to (owner + collaborator + org). */
function listRepos() {
  return getAllPages('/user/repos?affiliation=owner,collaborator,organization_member&sort=updated');
}

/** Streaming variant of listRepos — upsert each page before fetching the next. */
function listReposStreamed(opts = {}) {
  return streamPages('/user/repos?affiliation=owner,collaborator,organization_member&sort=updated', opts);
}

/** Organizations the authenticated user belongs to. */
function listOrgs() {
  return getAllPages('/user/orgs');
}

/** Repos for a specific org (covers orgs whose repos /user/repos may omit). */
function listOrgRepos(org) {
  return getAllPages(`/orgs/${org}/repos?sort=updated`);
}

/** Streaming variant of listOrgRepos. */
function listOrgReposStreamed(org, opts = {}) {
  return streamPages(`/orgs/${org}/repos?sort=updated`, opts);
}

function listMilestones(owner, repo, opts = {}) {
  return getAllPages(`/repos/${owner}/${repo}/milestones?state=all`, opts);
}

function createMilestone(owner, repo, { title, description, dueOn, state }) {
  return mutate('POST', `/repos/${owner}/${repo}/milestones`, {
    title,
    description,
    due_on: dueOn || undefined,
    state: state || 'open',
  });
}

function updateMilestone(owner, repo, number, patch) {
  const body = {};
  if (patch.title != null) body.title = patch.title;
  if (patch.description != null) body.description = patch.description;
  if (patch.dueOn !== undefined) body.due_on = patch.dueOn || null;
  if (patch.state != null) body.state = patch.state;
  return mutate('PATCH', `/repos/${owner}/${repo}/milestones/${number}`, body);
}

/** Issues (GitHub returns PRs too; callers filter on pull_request). */
function listIssues(owner, repo, opts = {}) {
  return getAllPages(`/repos/${owner}/${repo}/issues?state=all`, opts);
}

/** Streaming variant of listIssues — persist per page to keep heap flat.
 *  `onPage(items)` is called with each page of up to 100 issues/PRs. */
function listIssuesStreamed(owner, repo, opts = {}) {
  return streamPages(`/repos/${owner}/${repo}/issues?state=all`, opts);
}

function getIssue(owner, repo, number) {
  return get(`/repos/${owner}/${repo}/issues/${number}`);
}

function createIssue(owner, repo, { title, body, milestone, labels, assignees }) {
  return mutate('POST', `/repos/${owner}/${repo}/issues`, {
    title,
    body: body || undefined,
    milestone: milestone || undefined,
    labels: labels || undefined,
    assignees: assignees || undefined,
  });
}

function updateIssue(owner, repo, number, patch) {
  const body = {};
  if (patch.title != null) body.title = patch.title;
  if (patch.body != null) body.body = patch.body;
  if (patch.state != null) body.state = patch.state; // 'open' | 'closed'
  if (patch.milestone !== undefined) body.milestone = patch.milestone; // number | null
  if (patch.labels != null) body.labels = patch.labels;
  if (patch.assignees != null) body.assignees = patch.assignees;
  return mutate('PATCH', `/repos/${owner}/${repo}/issues/${number}`, body);
}

function listIssueComments(owner, repo, number) {
  return getAllPages(`/repos/${owner}/${repo}/issues/${number}/comments`);
}

/** Timeline events (closed/reopened, cross-referenced & connected PRs, mentions, labels…). */
function listIssueTimeline(owner, repo, number) {
  return getAllPages(`/repos/${owner}/${repo}/issues/${number}/timeline`);
}

/** Users that can be @mentioned/assigned in the repo (for comment autocomplete). */
function listMentionableUsers(owner, repo) {
  return getAllPages(`/repos/${owner}/${repo}/assignees`);
}

/** Repo collaborators (broader @mention pool than assignees alone). */
function listCollaborators(owner, repo) {
  return getAllPages(`/repos/${owner}/${repo}/collaborators?affiliation=all`);
}

function createIssueComment(owner, repo, number, body) {
  return mutate('POST', `/repos/${owner}/${repo}/issues/${number}/comments`, { body });
}

function listBranches(owner, repo, opts = {}) {
  return getAllPages(`/repos/${owner}/${repo}/branches`, opts);
}

function listReleases(owner, repo, opts = {}) {
  return getAllPages(`/repos/${owner}/${repo}/releases`, opts);
}

module.exports = {
  // pagination primitives
  getAllPages,
  streamPages,
  // high-level endpoints
  listRepos,
  listReposStreamed,
  listOrgs,
  listOrgRepos,
  listOrgReposStreamed,
  listMilestones,
  createMilestone,
  updateMilestone,
  listIssues,
  listIssuesStreamed,
  getIssue,
  createIssue,
  updateIssue,
  listIssueComments,
  createIssueComment,
  listIssueTimeline,
  listMentionableUsers,
  listCollaborators,
  listBranches,
  listReleases,
};
