'use strict';

/* eslint-disable no-console */

const { z } = require('zod');
const { shell } = require('electron');
const githubOAuth = require('../../auth/github-oauth.cjs');
const memoryMonitor = require('../../core/memory-monitor.cjs');
const syncService = require('../../github/github-sync-service.cjs');
const store = require('../../github/github-store.cjs');

const ISSUE_LIST_WARN_THRESHOLD = 10_000;

const PollSchema = z.object({
  deviceCode: z.string().min(1),
  interval: z.number().int().positive().max(60).optional(),
  expiresIn: z.number().int().positive().max(3600).optional(),
});

/**
 * IPC handlers for the GitHub project-sync feature.
 * Auth (device-flow), repo selection, data reads, bidirectional mutations, sync.
 */
function register({ ipcMain, windowManager }) {
  const guard = (event) => windowManager.isAuthorized(event.sender.id);
  const ok = (data) => ({ success: true, ...data });
  const fail = (err) => ({ success: false, error: err instanceof Error ? err.message : String(err) });

  // Run a full sync without blocking the renderer reply.
  const kickSync = () => {
    void syncService.syncNow().catch((e) => console.error('[github IPC] background sync:', e?.message));
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
      if (res.success) kickSync();
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
  ipcMain.handle('github:repos:list', async (event) => {
    if (!guard(event)) return fail('Unauthorized');
    try {
      return ok({ repos: store.listRepos() });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:repos:refresh', async (event) => {
    if (!guard(event)) return fail('Unauthorized');
    try {
      const repos = await syncService.refreshRepos();
      return ok({ repos });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:repos:setSelected', async (event, repoId, selected) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string') return fail('Invalid repoId');
    try {
      const repo = syncService.setRepoSelected(repoId, !!selected);
      if (selected) kickSync();
      return ok({ repo });
    } catch (err) {
      return fail(err);
    }
  });

  // --- reads --------------------------------------------------------------
  ipcMain.handle('github:milestones:list', async (event, repoId) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string') return fail('Invalid repoId');
    try {
      return ok({ milestones: store.listMilestones(repoId) });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:issues:list', async (event, repoId) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string') return fail('Invalid repoId');
    try {
      const count = store.countIssues(repoId);
      if (count > ISSUE_LIST_WARN_THRESHOLD) {
        console.warn(`[github IPC] github:issues:list repo ${repoId} has ${count} issues (threshold ${ISSUE_LIST_WARN_THRESHOLD})`);
      }
      if (memoryMonitor.isMemoryPressureHigh()) {
        const m = memoryMonitor.getMemoryInfo();
        console.warn(
          `[github IPC] github:issues:list skipped — memory pressure ${(m.heapUsedRatio * 100).toFixed(1)}% ` +
          `(heapUsed ${(m.heapUsed / 1024 / 1024).toFixed(0)}MB / ${(m.heapTotal / 1024 / 1024).toFixed(0)}MB)`,
        );
        return fail('Memory pressure too high to load issues. Try again in a moment.');
      }
      return ok({ issues: store.listIssuesSummary(repoId) });
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

  ipcMain.handle('github:branches:list', async (event, repoId) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string') return fail('Invalid repoId');
    try {
      return ok({ branches: store.listBranches(repoId) });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:releases:list', async (event, repoId) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string') return fail('Invalid repoId');
    try {
      return ok({ releases: store.listReleases(repoId) });
    } catch (err) {
      return fail(err);
    }
  });

  // --- mutations (bidirectional) -----------------------------------------
  ipcMain.handle('github:issues:update', async (event, id, patch) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof id !== 'string' || typeof patch !== 'object' || !patch) return fail('Invalid args');
    try {
      const issue = store.updateLocalIssue(id, patch);
      kickSync();
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
      const issue = store.updateLocalIssue(id, patch);
      kickSync();
      return ok({ issue });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:issues:create', async (event, repoId, data) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string' || typeof data?.title !== 'string') return fail('Invalid args');
    try {
      const issue = await syncService.createIssue(repoId, data);
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
      const milestone = store.updateLocalMilestone(id, patch);
      kickSync();
      return ok({ milestone });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:milestones:create', async (event, repoId, data) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string' || typeof data?.title !== 'string') return fail('Invalid args');
    try {
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
  ipcMain.handle('github:sync:now', async (event) => {
    if (!guard(event)) return fail('Unauthorized');
    try {
      return await syncService.syncNow();
    } catch (err) {
      return fail(err);
    }
  });
}

module.exports = { register };
