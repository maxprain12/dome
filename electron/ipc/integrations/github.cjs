'use strict';

/* eslint-disable no-console */

const { z } = require('zod');
const { shell } = require('electron');
const githubOAuth = require('../../auth/github-oauth.cjs');
const syncService = require('../../github/github-sync-service.cjs');
const store = require('../../github/github-store.cjs');

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
      return ok(await githubOAuth.getStatus());
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
      return ok({ repos: await store.listRepos() });
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
      const repo = await syncService.setRepoSelected(repoId, !!selected);
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
      return ok({ milestones: await store.listMilestones(repoId) });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:issues:list', async (event, repoId) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string') return fail('Invalid repoId');
    try {
      return ok({ issues: await store.listIssues(repoId) });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:issues:get', async (event, id) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof id !== 'string') return fail('Invalid id');
    try {
      return ok({ issue: await store.getIssue(id) });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:branches:list', async (event, repoId) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string') return fail('Invalid repoId');
    try {
      return ok({ branches: await store.listBranches(repoId) });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('github:releases:list', async (event, repoId) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof repoId !== 'string') return fail('Invalid repoId');
    try {
      return ok({ releases: await store.listReleases(repoId) });
    } catch (err) {
      return fail(err);
    }
  });

  // --- mutations (bidirectional) -----------------------------------------
  ipcMain.handle('github:issues:update', async (event, id, patch) => {
    if (!guard(event)) return fail('Unauthorized');
    if (typeof id !== 'string' || typeof patch !== 'object' || !patch) return fail('Invalid args');
    try {
      const issue = await store.updateLocalIssue(id, patch);
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
      const issue = await store.updateLocalIssue(id, patch);
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
      const milestone = await store.updateLocalMilestone(id, patch);
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
  // data URL. Cached in-memory.
  const imageCache = new Map(); // url -> dataUrl
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
    if (imageCache.has(url)) return ok({ dataUrl: imageCache.get(url) });
    try {
      const token = await githubOAuth.getToken();
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
      if (imageCache.size < 200) imageCache.set(url, dataUrl);
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
