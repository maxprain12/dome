'use strict';

/* eslint-disable no-console */

const { z } = require('zod');
const { shell } = require('electron');
const githubOAuth = require('../../auth/github-oauth.cjs');
const memoryMonitor = require('../../core/memory-monitor.cjs');
const syncService = require('../../github/github-sync-service.cjs');
const store = require('../../github/github-store.cjs');

const ISSUE_LIST_WARN_THRESHOLD = 10_000;

const IssuesListOptsSchema = z
  .object({
    state: z.enum(['open', 'closed']).optional(),
    limit: z.number().int().positive().max(store.ISSUE_LIST_MAX_LIMIT).optional(),
    offset: z.number().int().nonnegative().optional(),
  })
  .optional();

/** Coalesce concurrent identical issues:list reads (sync broadcast + UI open). */
const _issuesListInflight = new Map();

function memoryPressureFail(label) {
  if (!memoryMonitor.isMemoryPressureHigh()) return null;
  const m = memoryMonitor.getMemoryInfo();
  console.warn(
    `[github IPC] ${label} skipped — memory pressure ${(m.heapUsedRatio * 100).toFixed(1)}% ` +
    `(heapUsed ${(m.heapUsed / 1024 / 1024).toFixed(0)}MB / ${(m.heapTotal / 1024 / 1024).toFixed(0)}MB)`,
  );
  return { success: false, error: 'Memory pressure too high to load GitHub data. Try again in a moment.' };
}

async function fetchIssuesListPage(repoId, opts = {}) {
  const parsed = IssuesListOptsSchema.safeParse(opts);
  const safe = parsed.success ? parsed.data ?? {} : {};
  const state = safe.state;
  const limit = safe.limit ?? store.ISSUE_LIST_DEFAULT_LIMIT;
  const offset = safe.offset ?? 0;
  const total = store.countIssues(repoId, state);
  const issues = store.listIssuesSummary(repoId, { state, limit, offset });
  return {
    issues,
    total,
    limit,
    offset,
    truncated: offset + issues.length < total,
  };
}

const PollSchema = z.object({
  deviceCode: z.string().min(1),
  interval: z.number().int().positive().max(60).optional(),
  expiresIn: z.number().int().positive().max(3600).optional(),
});

const ProjectIdSchema = z.object({
  projectId: z.string().min(1).optional(),
});

const RemoteRepoSchema = z.object({
  id: z.coerce.number().int().positive(),
  full_name: z.string().min(1),
  name: z.string().min(1),
  owner: z.union([z.string(), z.object({ login: z.string() })]).optional(),
  private: z.union([z.boolean(), z.number().int()]).optional(),
  html_url: z.string().nullable().optional(),
});

function normalizeRemotePayload(remote) {
  if (!remote) return null;
  return {
    id: remote.id,
    full_name: remote.full_name,
    name: remote.name,
    owner: typeof remote.owner === 'string' ? remote.owner : remote.owner?.login || '',
    private: remote.private === true || remote.private === 1,
    html_url: remote.html_url ?? null,
  };
}

const SetSelectedSchema = z.object({
  projectId: z.string().min(1),
  selected: z.boolean(),
  repoId: z.string().min(1).optional(),
  remote: RemoteRepoSchema.optional(),
});

function parseProjectId(payload) {
  const parsed = ProjectIdSchema.safeParse(payload && typeof payload === 'object' ? payload : {});
  if (!parsed.success) return 'default';
  return store.normalizeProjectId(parsed.data.projectId);
}

function assertRepoInProject(repoId, projectId) {
  const repo = store.getRepo(repoId);
  if (!repo) return { ok: false, error: 'Repo not found' };
  if (projectId && repo.project_id !== store.normalizeProjectId(projectId)) {
    return { ok: false, error: 'Repo does not belong to this vault' };
  }
  return { ok: true, repo };
}

/**
 * IPC handlers for the GitHub project-sync feature.
 * Auth (device-flow), repo selection, data reads, bidirectional mutations, sync.
 */
function register({ ipcMain, windowManager }) {
  const guard = (event) => windowManager.isAuthorized(event.sender.id);
  const ok = (data) => ({ success: true, ...data });
  const fail = (err) => ({ success: false, error: err instanceof Error ? err.message : String(err) });

  // Coalesce mutation-triggered syncs; manual sync uses syncNow() directly.
  const scheduleSync = (projectId) => {
    syncService.scheduleSync(projectId);
  };

  const projectIdForIssue = (issueId) => {
    const issue = store.getIssue(issueId);
    if (!issue) return undefined;
    const repo = store.getRepo(issue.repo_id);
    return repo?.project_id;
  };

  const projectIdForMilestone = (milestoneId) => {
    const milestone = store.getMilestone(milestoneId);
    if (!milestone) return undefined;
    const repo = store.getRepo(milestone.repo_id);
    return repo?.project_id;
  };

  /** Push local SQLite changes to the renderer immediately (before GitHub sync). */
  const notifyLocalChange = () => {
    windowManager.broadcast('github:data:updated', { local: true });
  };

  // --- auth ---------------------------------------------------------------
  ipcMain.handle('github:auth:start', async (event) => {
    if (!guard(event)) return fail('Unauthorized');
    try {
      const info = await githubOAuth.startDeviceFlow();
      void shell.openExternal(info.verificationUri).catch(() => {});
      return ok(info);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:auth:poll', async (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    const parsed = PollSchema.safeParse(payload);
    if (!parsed.success) return fail('Invalid poll payload');
    try {
      const res = await githubOAuth.pollForAccessToken(parsed.data);
      if (res.success) scheduleSync();
      return res;
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:auth:status', async (event) => {
    if (!guard(event)) return fail('Unauthorized');
    try {
      return ok(githubOAuth.getStatus());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:auth:disconnect', async (event) => {
    if (!guard(event)) return fail('Unauthorized');
    try {
      // Wipe local data + calendar projection so a different account can't see stale repos.
      await syncService.purgeAllData();
      return githubOAuth.disconnect();
    } catch (err) {
      return fail(err);
    }
  });

  // --- repos --------------------------------------------------------------
  ipcMain.handle('github:repos:list', async (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    try {
      const projectId = parseProjectId(payload);
      return ok({ repos: store.listRepos(projectId) });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:repos:refresh', async (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    try {
      const projectId = parseProjectId(payload);
      const result = await syncService.refreshRepos(projectId);
      return ok(result);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:repos:setSelected', async (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    const parsed = SetSelectedSchema.safeParse(payload);
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => i.message).join('; ') || 'Invalid setSelected payload');
    }
    try {
      const data = {
        ...parsed.data,
        remote: normalizeRemotePayload(parsed.data.remote),
      };
      const { repo, syncNeeded } = syncService.setRepoSelected(data);
      if (syncNeeded) scheduleSync(parsed.data.projectId);
      return ok({ repo });
    } catch (err) {
      return fail(err);
    }
  });

  // --- reads --------------------------------------------------------------
  ipcMain.handle('github:milestones:list', async (event, repoId, opts) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string') return fail('Invalid repoId');
    const memFail = memoryPressureFail('github:milestones:list');
    if (memFail) return memFail;
    try {
      const projectId = opts && typeof opts === 'object' ? opts.projectId : null;
      const check = assertRepoInProject(repoId, projectId);
      if (!check.ok) return fail(check.error);
      return ok({ milestones: store.listMilestonesSummary(repoId) });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:milestones:get', async (event, id) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof id !== 'string') return fail('Invalid id');
    try {
      const milestone = store.getMilestone(id);
      if (!milestone) return fail('Milestone not found');
      return ok({ milestone });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:issues:list', async (event, repoId, opts) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string') return fail('Invalid repoId');
    const memFail = memoryPressureFail('github:issues:list');
    if (memFail) return memFail;
    try {
      const projectId = opts && typeof opts === 'object' ? opts.projectId : null;
      const check = assertRepoInProject(repoId, projectId);
      if (!check.ok) return fail(check.error);
      const cacheKey = `${repoId}:${JSON.stringify(opts ?? {})}`;
      if (_issuesListInflight.has(cacheKey)) {
        return ok(await _issuesListInflight.get(cacheKey));
      }
      const work = (async () => {
        const total = store.countIssues(repoId);
        if (total > ISSUE_LIST_WARN_THRESHOLD) {
          console.warn(
            `[github IPC] github:issues:list repo ${repoId} has ${total} issues (threshold ${ISSUE_LIST_WARN_THRESHOLD})`,
          );
        }
        return fetchIssuesListPage(repoId, opts);
      })();
      _issuesListInflight.set(cacheKey, work);
      try {
        return ok(await work);
      } finally {
        _issuesListInflight.delete(cacheKey);
      }
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:issues:get', async (event, id) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof id !== 'string') return fail('Invalid id');
    try {
      return ok({ issue: store.getIssue(id) });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:branches:list', async (event, repoId, opts) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string') return fail('Invalid repoId');
    const memFail = memoryPressureFail('github:branches:list');
    if (memFail) return memFail;
    try {
      const projectId = opts && typeof opts === 'object' ? opts.projectId : null;
      const check = assertRepoInProject(repoId, projectId);
      if (!check.ok) return fail(check.error);
      return ok({ branches: store.listBranches(repoId) });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:releases:list', async (event, repoId, opts) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string') return fail('Invalid repoId');
    const memFail = memoryPressureFail('github:releases:list');
    if (memFail) return memFail;
    try {
      const projectId = opts && typeof opts === 'object' ? opts.projectId : null;
      const check = assertRepoInProject(repoId, projectId);
      if (!check.ok) return fail(check.error);
      return ok({ releases: store.listReleases(repoId) });
    } catch (err) {
      return fail(err);
    }
  });

  // --- mutations (bidirectional) -----------------------------------------
  const touchIssueSearchIndex = (issueId) => {
    try {
      const sourceIndex = require('../../search/source-index.cjs');
      sourceIndex.indexGithubIssueById(issueId);
    } catch (err) {
      console.warn('[github IPC] source index upsert failed:', err?.message || err);
    }
  };

  ipcMain.handle('github:issues:update', async (event, id, patch) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof id !== 'string' || typeof patch !== 'object' || !patch) return fail('Invalid args');
    try {
      const { issue, changed } = store.updateLocalIssue(id, patch);
      if (changed) {
        touchIssueSearchIndex(id);
        notifyLocalChange();
        scheduleSync(projectIdForIssue(id));
      }
      return ok({ issue });
    } catch (err) {
      return fail(err);
    }
  });

  // Kanban column move = change state (open/closed) and/or milestone.
  ipcMain.handle('github:issues:move', async (event, id, { state, milestoneNumber } = {}) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof id !== 'string') return fail('Invalid id');
    try {
      const patch = {};
      if (state === 'open' || state === 'closed') patch.state = state;
      if (milestoneNumber !== undefined) patch.milestoneNumber = milestoneNumber;
      const { issue, changed } = store.updateLocalIssue(id, patch);
      if (changed) {
        touchIssueSearchIndex(id);
        notifyLocalChange();
        scheduleSync(projectIdForIssue(id));
      }
      return ok({ issue });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:issues:create', async (event, repoId, data) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string' || typeof data?.title !== 'string') return fail('Invalid args');
    try {
      const check = assertRepoInProject(repoId, data?.projectId);
      if (!check.ok) return fail(check.error);
      const issue = await syncService.createIssue(repoId, data);
      if (issue?.id) touchIssueSearchIndex(issue.id);
      return ok({ issue });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:issues:listComments', async (event, issueId) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof issueId !== 'string') return fail('Invalid issueId');
    try {
      const comments = await syncService.listIssueComments(issueId);
      return ok({ comments });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:issues:createComment', async (event, issueId, body) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof issueId !== 'string' || typeof body !== 'string') return fail('Invalid args');
    try {
      const comment = await syncService.createIssueComment(issueId, body);
      return ok({ comment });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:issues:listTimeline', async (event, issueId) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof issueId !== 'string') return fail('Invalid issueId');
    try {
      const timeline = await syncService.listIssueTimeline(issueId);
      return ok({ timeline });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:issues:listMentionables', async (event, issueId) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof issueId !== 'string') return fail('Invalid issueId');
    try {
      const users = await syncService.listMentionableUsers(issueId);
      return ok({ users });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:milestones:update', async (event, id, patch) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof id !== 'string' || typeof patch !== 'object' || !patch) return fail('Invalid args');
    try {
      const { milestone, changed } = store.updateLocalMilestone(id, patch);
      if (changed) {
        notifyLocalChange();
        scheduleSync(projectIdForMilestone(id));
      }
      return ok({ milestone });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:milestones:create', async (event, repoId, data) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string' || typeof data?.title !== 'string') return fail('Invalid args');
    try {
      const check = assertRepoInProject(repoId, data?.projectId);
      if (!check.ok) return fail(check.error);
      const milestone = await syncService.createMilestone(repoId, data);
      return ok({ milestone });
    } catch (err) {
      return fail(err);
    }
  });

  // --- image proxy --------------------------------------------------------
  // GitHub issue images (user-attachments / *.githubusercontent.com) need auth
  // and can't be loaded directly in an <img>. Fetch with the token, return a
  // data URL. Cached in-memory with an LRU+TTL policy so a session browsing
  // many issue images can't hold up to ~2GB of base64 forever (the old
  // count-only cap of 200 × up to 8MB had no age eviction).
  const IMAGE_CACHE_MAX = 50;        // entries
  const IMAGE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
  const IMAGE_CACHE_MAX_BYTES = 64 * 1024 * 1024; // 64 MB total
  /** @type {Map<string, { dataUrl: string, bytes: number, ts: number }>} */
  const imageCache = new Map();
  let imageCacheBytes = 0;

  function imageCacheGet(url) {
    const entry = imageCache.get(url);
    if (!entry) return null;
    if (Date.now() - entry.ts > IMAGE_CACHE_TTL_MS) {
      // Expired — evict lazily.
      imageCache.delete(url);
      imageCacheBytes -= entry.bytes;
      return null;
    }
    // LRU: move to most-recently-used position (Map preserves insertion order).
    imageCache.delete(url);
    imageCache.set(url, entry);
    return entry.dataUrl;
  }

  function imageCacheEvictOne() {
    // Map iteration order = oldest first (LRU victim).
    const oldest = imageCache.keys().next();
    if (oldest.done) return;
    const key = oldest.value;
    const entry = imageCache.get(key);
    if (entry) imageCacheBytes -= entry.bytes;
    imageCache.delete(key);
  }

  function imageCacheSet(url, dataUrl) {
    const bytes = Buffer.byteLength(dataUrl, 'utf8');
    // If this single entry is huge, skip caching it rather than evicting the
    // whole cache to fit one outlier.
    if (bytes > IMAGE_CACHE_MAX_BYTES / 2) return;
    // Remove existing entry for this key (refresh) so we don't double-count.
    const existing = imageCache.get(url);
    if (existing) imageCacheBytes -= existing.bytes;
    // Evict until both count and byte caps are satisfied.
    while (
      (imageCache.size >= IMAGE_CACHE_MAX || imageCacheBytes + bytes > IMAGE_CACHE_MAX_BYTES) &&
      imageCache.size > 0
    ) {
      imageCacheEvictOne();
    }
    imageCache.set(url, { dataUrl, bytes, ts: Date.now() });
    imageCacheBytes += bytes;
  }

  ipcMain.handle('github:image:resolve', async (event, url) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof url !== 'string') return fail('Invalid url');
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return fail('Invalid url');
    }
    if (parsed.protocol !== 'https:') return fail('Only https allowed');
    const host = parsed.hostname;
    const allowed = host === 'github.com' || host.endsWith('githubusercontent.com');
    if (!allowed) return fail('Host not allowed');
    const cached = imageCacheGet(url);
    if (cached) return ok({ dataUrl: cached });
    try {
      const token = githubOAuth.getToken();
      const res = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': githubOAuth.USER_AGENT,
          Accept: 'application/vnd.github.raw+json, application/octet-stream, image/*, */*',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) return fail(`HTTP ${res.status}`);
      const ctRaw = (res.headers.get('content-type') || 'image/png').split(';')[0].trim();
      const ct = ctRaw.startsWith('image/') || ctRaw === 'application/octet-stream'
        ? (ctRaw === 'application/octet-stream' ? 'image/png' : ctRaw)
        : null;
      if (!ct) return fail(`Not an image (${ctRaw})`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 8 * 1024 * 1024) return fail('Image too large');
      const dataUrl = `data:${ct};base64,${buf.toString('base64')}`;
      imageCacheSet(url, dataUrl);
      return ok({ dataUrl });
    } catch (err) {
      return fail(err);
    }
  });

  // --- sync ---------------------------------------------------------------
  ipcMain.handle('github:sync:now', async (event, payload) => {
    if (!guard(event)) return fail('Unauthorized');
    try {
      const projectId =
        payload && typeof payload === 'object' && payload.projectId
          ? payload.projectId
          : undefined;
      return await syncService.syncNow(projectId ? { projectId } : {});
    } catch (err) {
      return fail(err);
    }
  });
}

module.exports = { register };
