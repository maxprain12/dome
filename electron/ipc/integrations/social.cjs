'use strict';

/* eslint-disable no-console */

const { z } = require('zod');

const { getSocialService } = require('../../social/social-service.cjs');
const socialCalendarBridge = require('../../social/social-calendar-bridge.cjs');
const socialCloudAdapter = require('../../storage/social-cloud-adapter.cjs');

const ProviderSchema = z.enum(['linkedin', 'instagram', 'x']);
const ProviderConfigSchema = z.object({
  provider: ProviderSchema,
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  /** LinkedIn only: request organization scopes to manage company pages. */
  orgEnabled: z.boolean().optional(),
});
const OAuthPortSchema = z.object({ port: z.number().int().min(1025).max(65535) });
const ConnectOAuthSchema = z.object({ provider: ProviderSchema });
const ConnectTokenSchema = z.object({ provider: ProviderSchema, accessToken: z.string().min(1) });
const AccountIdSchema = z.object({ accountId: z.string().min(1) });
const PostIdSchema = z.object({ postId: z.string().min(1) });
const MediaItemSchema = z
  .object({
    type: z.enum(['image', 'video', 'reel']).optional(),
    url: z.string().url().optional(),
    path: z.string().min(1).optional(),
    resourceId: z.string().min(1).optional(),
    name: z.string().max(300).optional(),
  })
  .refine((m) => Boolean(m.url || m.path || m.resourceId), {
    message: 'media item needs url, path or resourceId',
  });
const LibraryQuerySchema = z.object({
  projectId: z.string().optional().nullable(),
});
const MediaPreviewSchema = z
  .object({
    path: z.string().min(1).optional(),
    resourceId: z.string().min(1).optional(),
  })
  .refine((m) => Boolean(m.path || m.resourceId), { message: 'path or resourceId required' });
const PostCreateSchema = z.object({
  provider: ProviderSchema,
  accountId: z.string().optional().nullable(),
  body: z.string().max(10000).default(''),
  media: z.array(MediaItemSchema).max(10).default([]),
  linkUrl: z.string().url().optional().nullable(),
  topics: z.array(z.string().max(80)).max(20).default([]),
  campaign: z.string().max(200).optional().nullable(),
  scheduledAt: z.number().int().positive().optional().nullable(),
  groupId: z.string().optional().nullable(),
});
const PostUpdateSchema = z.object({
  postId: z.string().min(1),
  patch: z.object({
    accountId: z.string().nullable().optional(),
    body: z.string().max(10000).optional(),
    media: z.array(MediaItemSchema).max(10).optional(),
    linkUrl: z.string().url().nullable().optional(),
    topics: z.array(z.string().max(80)).max(20).optional(),
    campaign: z.string().max(200).nullable().optional(),
    scheduledAt: z.number().int().positive().nullable().optional(),
    status: z.enum(['draft', 'scheduled']).optional(),
  }),
});
const PostListSchema = z.object({
  status: z.enum(['draft', 'scheduled', 'publishing', 'published', 'failed']).optional().nullable(),
  limit: z.number().int().positive().max(500).optional(),
});
const GrowthQuerySchema = z.object({
  days: z.number().int().min(7).max(365).optional(),
});
const ReportGenerateSchema = z.object({
  periodDays: z.number().int().min(7).max(365).optional(),
  language: z.enum(['es', 'en', 'fr', 'pt']).optional(),
});
const ReportIdSchema = z.object({ reportId: z.string().min(1) });
const ReportConfigSchema = z.object({
  intervalHours: z.number().int().min(0).max(2160).optional(),
  periodDays: z.number().int().min(7).max(365).optional(),
  language: z.enum(['es', 'en', 'fr', 'pt']).optional(),
});

function register({ ipcMain, windowManager, database, fileStorage }) {
  const service = getSocialService(database, windowManager);

  /** Auth + zod validation + uniform {success,data|error} envelope. */
  const wrap = (schema, fn) => async (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    let input = raw;
    if (schema) {
      const parsed = schema.safeParse(raw ?? {});
      if (!parsed.success) {
        return { success: false, error: 'Invalid payload: ' + parsed.error.issues.map((i) => i.message).join('; ') };
      }
      input = parsed.data;
    }
    try {
      const data = await fn(input, event);
      return { success: true, data };
    } catch (error) {
      console.error('[Social IPC] error:', error.message);
      return { success: false, error: error.message };
    }
  };

  // Provider app configuration (Settings → Social)
  ipcMain.handle('social:providers:status', wrap(null, () => ({
    providers: service.PROVIDERS.map((p) => ({
      ...service.store.getProviderConfigStatus(p),
      ...service.providerCapabilities[p],
      redirectUri: service.oauth.redirectUri(p, service.store.getOAuthPort()),
    })),
    oauthPort: service.store.getOAuthPort(),
    encryptionAvailable: service.store.encryptionAvailable(),
  })));

  ipcMain.handle('social:providers:set-config', wrap(ProviderConfigSchema, ({ provider, clientId, clientSecret, orgEnabled }) => {
    const patch = {};
    if (clientId !== undefined) patch.clientId = clientId;
    if (clientSecret !== undefined) patch.clientSecret = clientSecret;
    if (Object.keys(patch).length > 0) service.store.setProviderConfig(provider, patch);
    if (provider === 'linkedin' && orgEnabled !== undefined) {
      service.store.setLinkedInOrgEnabled(orgEnabled);
    }
    return service.store.getProviderConfigStatus(provider);
  }));

  ipcMain.handle('social:oauth:set-port', wrap(OAuthPortSchema, ({ port }) => {
    service.store.setOAuthPort(port);
    return { port };
  }));

  // Accounts
  ipcMain.handle('social:accounts:list', wrap(null, () => service.store.listAccounts()));
  ipcMain.handle('social:connect-oauth', wrap(ConnectOAuthSchema, ({ provider }) => service.connectOAuth(provider)));
  ipcMain.handle('social:connect-token', wrap(ConnectTokenSchema, ({ provider, accessToken }) =>
    service.connectWithToken(provider, accessToken)
  ));
  ipcMain.handle('social:oauth:cancel', wrap(null, () => ({ cancelled: service.oauth.cancelPending() })));
  ipcMain.handle('social:linkedin:sync-orgs', wrap(AccountIdSchema, ({ accountId }) =>
    service.syncLinkedInOrganizations(accountId)
  ));
  ipcMain.handle('social:disconnect', wrap(AccountIdSchema, ({ accountId }) => {
    service.disconnect(accountId);
    return { deleted: true };
  }));

  // Posts
  ipcMain.handle('social:posts:list', wrap(PostListSchema, ({ status, limit }) =>
    service.store.listPosts({ status: status || null, limit: limit || 100 })
  ));
  ipcMain.handle('social:posts:get', wrap(PostIdSchema, ({ postId }) => {
    const post = service.store.getPost(postId);
    if (!post) throw new Error('Post not found');
    return post;
  }));
  ipcMain.handle('social:posts:create', wrap(PostCreateSchema, async (input) => {
    const post = service.store.createPost(input);
    if (
      post.accountId
      && service.store.isAccountCloudPublishing(post.accountId)
      && (post.status === 'scheduled' || post.scheduledAt)
    ) {
      await socialCloudAdapter
        .syncPostMediaStorage({ database, windowManager }, service.store, post.id)
        .catch((err) => console.warn('[Social] cloud media sync:', err?.message || err));
    }
    const latest = service.store.getPost(post.id);
    windowManager.broadcast?.('social:post-updated', latest);
    void socialCalendarBridge.syncPostEvent(latest);
    return latest;
  }));
  ipcMain.handle('social:posts:update', wrap(PostUpdateSchema, async ({ postId, patch }) => {
    const post = service.store.updatePost(postId, patch);
    const accountId = patch.accountId ?? post.accountId;
    if (
      accountId
      && service.store.isAccountCloudPublishing(accountId)
      && (post.status === 'scheduled' || post.scheduledAt)
    ) {
      await socialCloudAdapter
        .syncPostMediaStorage({ database, windowManager }, service.store, postId)
        .catch((err) => console.warn('[Social] cloud media sync:', err?.message || err));
    }
    const latest = service.store.getPost(postId);
    windowManager.broadcast?.('social:post-updated', latest);
    void socialCalendarBridge.syncPostEvent(latest);
    return latest;
  }));
  ipcMain.handle('social:posts:delete', wrap(PostIdSchema, ({ postId }) => {
    service.store.deletePost(postId);
    windowManager.broadcast?.('social:post-updated', { id: postId, deleted: true });
    void socialCalendarBridge.removePostEvent(postId);
    return { deleted: true };
  }));
  ipcMain.handle('social:posts:publish', wrap(PostIdSchema, ({ postId }) => service.publishPost(postId)));

  // Media pickers — local files (native dialog) and vault image/video resources
  ipcMain.handle('social:media:pick', wrap(null, async () => {
    const { dialog } = require('electron');
    const path = require('path');
    const fs = require('fs');
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'm4v'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
        { name: 'Videos', extensions: ['mp4', 'mov', 'm4v'] },
      ],
    });
    if (result.canceled) return { cancelled: true, items: [] };
    const { IMAGE_EXTS } = require('../../social/social-media.cjs');
    return {
      cancelled: false,
      items: result.filePaths.map((p) => ({
        path: p,
        name: path.basename(p),
        size: fs.statSync(p).size,
        type: IMAGE_EXTS.has(path.extname(p).toLowerCase()) ? 'image' : 'video',
      })),
    };
  }));

  ipcMain.handle('social:media:library', wrap(LibraryQuerySchema, ({ projectId }) => {
    const vaultStore = require('../../storage/vault-store.cjs');
    const fs = require('fs');
    const queries = database.getQueries();
    const rows = queries.getResourcesByProject.all(projectId || 'default');
    const byId = new Map(rows.map((r) => [r.id, r]));
    // Vault folder path ("images / p1") so the composer can show where each
    // media item lives — titles alone are ambiguous (01.png in many folders).
    const folderPathOf = (row) => {
      const parts = [];
      const seen = new Set();
      let cur = row.folder_id ? byId.get(row.folder_id) : null;
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        parts.unshift(cur.title || '');
        cur = cur.folder_id ? byId.get(cur.folder_id) : null;
      }
      return parts.filter(Boolean).join(' / ');
    };
    return rows
      .filter((r) => r.type === 'image' || r.type === 'video')
      .map((r) => {
        let hasFile = false;
        try {
          const p = vaultStore.getResourceFilePath(r, queries, fileStorage);
          hasFile = Boolean(p && fs.existsSync(p));
        } catch { /* unresolvable → skip */ }
        return hasFile
          ? { resourceId: r.id, title: r.title, type: r.type, folderPath: folderPathOf(r) }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.folderPath.localeCompare(b.folderPath) || a.title.localeCompare(b.title))
      .slice(0, 200);
  }));

  // Composer preview thumbnails (images only, size-capped data URL)
  ipcMain.handle('social:media:preview', wrap(MediaPreviewSchema, ({ path: filePath, resourceId }) => {
    const fs = require('fs');
    const path = require('path');
    const { IMAGE_EXTS } = require('../../social/social-media.cjs');
    let resolved = filePath || null;
    if (resourceId) {
      const vaultStore = require('../../storage/vault-store.cjs');
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);
      if (!resource) return { dataUrl: null };
      resolved = vaultStore.getResourceFilePath(resource, queries, fileStorage);
    }
    if (!resolved || !fs.existsSync(resolved)) return { dataUrl: null };
    const ext = path.extname(resolved).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) return { dataUrl: null }; // videos → icon placeholder
    const stat = fs.statSync(resolved);
    if (stat.size > 4 * 1024 * 1024) return { dataUrl: null };
    const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }[ext];
    return { dataUrl: `data:${mime};base64,${fs.readFileSync(resolved).toString('base64')}` };
  }));

  // Metrics & dashboard
  ipcMain.handle('social:metrics:post', wrap(PostIdSchema, ({ postId }) => service.store.listMetricsForPost(postId)));
  ipcMain.handle('social:metrics:refresh', wrap(null, () => service.refreshAllMetrics()));
  ipcMain.handle('social:summary', wrap(null, () => service.getSummary()));
  ipcMain.handle('social:growth', wrap(GrowthQuerySchema, ({ days }) => service.getGrowth({ days: days || 90 })));

  // AI growth reports
  ipcMain.handle('social:reports:list', wrap(null, () => ({
    reports: service.store.listReports(30),
    config: service.store.getReportConfig(),
  })));
  ipcMain.handle('social:reports:get', wrap(ReportIdSchema, ({ reportId }) => {
    const report = service.store.getReport(reportId);
    if (!report) throw new Error('Report not found');
    return report;
  }));
  ipcMain.handle('social:reports:generate', wrap(ReportGenerateSchema, ({ periodDays, language }) => {
    // Persist the requested language so scheduled reports match the UI language.
    if (language) service.store.setReportConfig({ language });
    return service.generateReport({ periodDays, language, trigger: 'user' });
  }));
  ipcMain.handle('social:reports:delete', wrap(ReportIdSchema, ({ reportId }) => {
    service.store.deleteReport(reportId);
    windowManager.broadcast?.('social:report-updated', { id: reportId, deleted: true });
    return { deleted: true };
  }));
  ipcMain.handle('social:reports:config:get', wrap(null, () => service.store.getReportConfig()));
  ipcMain.handle('social:reports:config:set', wrap(ReportConfigSchema, (input) => service.store.setReportConfig(input)));

  // Plan 014/018 — drafts + cold DM + capability matrix
  ipcMain.handle('social:capabilities', wrap(null, () => service.getIntegrationCapabilities()));
  ipcMain.handle('social:drafts:list', wrap(null, () => ({ drafts: service.store.listReplyDrafts() })));
  ipcMain.handle(
    'social:drafts:create-from-match',
    wrap(
      z.object({
        hashtag: z.string().min(1),
        commentText: z.string().min(1),
        replyTemplate: z.string().optional(),
        provider: ProviderSchema.optional(),
        accountId: z.string().optional(),
        postId: z.string().optional(),
        externalCommentId: z.string().optional(),
        commentAuthor: z.string().optional(),
        commentAuthorExternalId: z.string().optional(),
        linkUrl: z.string().url().optional().nullable(),
        mode: z.enum(['live', 'draft_only']).optional(),
      }),
      (input) => service.createDraftFromMatchedComment({
        ...input,
        mode: input.mode || 'live',
      }),
    ),
  );
  ipcMain.handle(
    'social:drafts:send',
    wrap(z.object({ draftId: z.string().min(1) }), ({ draftId }) => service.sendReplyDraft(draftId)),
  );
  ipcMain.handle(
    'social:drafts:dismiss',
    wrap(z.object({ draftId: z.string().min(1) }), ({ draftId }) => {
      const result = service.store.dismissReplyDraft(draftId);
      windowManager.broadcast?.('social:drafts-updated', { id: draftId, deleted: true });
      return result;
    }),
  );
  ipcMain.handle('social:drafts:poll-now', wrap(null, () => service.pollCommentsAndAutoReply()));
  ipcMain.handle(
    'social:live-reply-rules:get',
    wrap(null, () => ({ rules: service.store.getLiveReplyRules() })),
  );
  ipcMain.handle(
    'social:live-reply-rules:set',
    wrap(
      z.object({
        rules: z.array(
          z.object({
            id: z.string().min(1),
            enabled: z.boolean().optional(),
            mode: z.enum(['live', 'draft_only']).optional(),
            hashtag: z.string().min(1),
            replyTemplate: z.string().optional(),
            linkUrl: z.string().optional().nullable(),
            accountIds: z.array(z.string()).nullable().optional(),
            postIds: z.array(z.string()).nullable().optional(),
          }),
        ),
      }),
      ({ rules }) => ({ rules: service.store.setLiveReplyRules(rules) }),
    ),
  );

  service.startScheduler();
  // Backfill calendar events for already-scheduled posts (boot catch-up).
  setTimeout(() => void socialCalendarBridge.syncAllFromStore(service.store), 20 * 1000);
}

module.exports = { register };
