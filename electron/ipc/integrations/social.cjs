'use strict';

/* eslint-disable no-console */

const { z } = require('zod');

const { getSocialService } = require('../../social/social-service.cjs');

const ProviderSchema = z.enum(['linkedin', 'instagram', 'x']);
const ProviderConfigSchema = z.object({
  provider: ProviderSchema,
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});
const OAuthPortSchema = z.object({ port: z.number().int().min(1025).max(65535) });
const ConnectOAuthSchema = z.object({ provider: ProviderSchema });
const ConnectTokenSchema = z.object({ provider: ProviderSchema, accessToken: z.string().min(1) });
const AccountIdSchema = z.object({ accountId: z.string().min(1) });
const PostIdSchema = z.object({ postId: z.string().min(1) });
const MediaItemSchema = z.object({
  type: z.enum(['image', 'video', 'reel']).optional(),
  url: z.string().url(),
});
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

function register({ ipcMain, windowManager, database }) {
  const service = getSocialService(database, windowManager);

  const handle = (channel, schema, fn) => {
    ipcMain.handle(channel, async (event, raw) => {
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
        console.error(`[Social IPC] ${channel} error:`, error.message);
        return { success: false, error: error.message };
      }
    });
  };

  // Provider app configuration (Settings → Social)
  handle('social:providers:status', null, () => ({
    providers: service.PROVIDERS.map((p) => ({
      ...service.store.getProviderConfigStatus(p),
      ...service.providerCapabilities[p],
      redirectUri: service.oauth.redirectUri(p, service.store.getOAuthPort()),
    })),
    oauthPort: service.store.getOAuthPort(),
    encryptionAvailable: service.store.encryptionAvailable(),
  }));

  handle('social:providers:set-config', ProviderConfigSchema, ({ provider, clientId, clientSecret }) => {
    service.store.setProviderConfig(provider, { clientId, clientSecret });
    return service.store.getProviderConfigStatus(provider);
  });

  handle('social:oauth:set-port', OAuthPortSchema, ({ port }) => {
    service.store.setOAuthPort(port);
    return { port };
  });

  // Accounts
  handle('social:accounts:list', null, () => service.store.listAccounts());
  handle('social:connect-oauth', ConnectOAuthSchema, ({ provider }) => service.connectOAuth(provider));
  handle('social:connect-token', ConnectTokenSchema, ({ provider, accessToken }) =>
    service.connectWithToken(provider, accessToken)
  );
  handle('social:oauth:cancel', null, () => ({ cancelled: service.oauth.cancelPending() }));
  handle('social:disconnect', AccountIdSchema, ({ accountId }) => {
    service.disconnect(accountId);
    return { deleted: true };
  });

  // Posts
  handle('social:posts:list', PostListSchema, ({ status, limit }) =>
    service.store.listPosts({ status: status || null, limit: limit || 100 })
  );
  handle('social:posts:get', PostIdSchema, ({ postId }) => {
    const post = service.store.getPost(postId);
    if (!post) throw new Error('Post not found');
    return post;
  });
  handle('social:posts:create', PostCreateSchema, (input) => {
    const post = service.store.createPost(input);
    windowManager.broadcast?.('social:post-updated', post);
    return post;
  });
  handle('social:posts:update', PostUpdateSchema, ({ postId, patch }) => {
    const post = service.store.updatePost(postId, patch);
    windowManager.broadcast?.('social:post-updated', post);
    return post;
  });
  handle('social:posts:delete', PostIdSchema, ({ postId }) => {
    service.store.deletePost(postId);
    windowManager.broadcast?.('social:post-updated', { id: postId, deleted: true });
    return { deleted: true };
  });
  handle('social:posts:publish', PostIdSchema, ({ postId }) => service.publishPost(postId));

  // Metrics & dashboard
  handle('social:metrics:post', PostIdSchema, ({ postId }) => service.store.listMetricsForPost(postId));
  handle('social:metrics:refresh', null, () => service.refreshAllMetrics());
  handle('social:summary', null, () => service.getSummary());

  service.startScheduler();
}

module.exports = { register };
