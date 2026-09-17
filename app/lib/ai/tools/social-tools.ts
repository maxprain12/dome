/**
 * Social hub tools — LinkedIn / Instagram / X accounts, posts, metrics.
 * Many runs execute via main-process dispatcher (toolDefinitions → createToolRegistry).
 * Local execute uses social:* IPC for renderer-only paths.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readBooleanParam, readNumberParam } from './common';
import { isElectronAI } from '@/lib/utils/formatting';

function requireElectron() {
  if (!isElectronAI()) {
    return jsonResult({ success: false, error: 'Social tools require the Dome desktop app.' });
  }
  return null;
}

function ipcError(res: { success?: boolean; error?: string } | null | undefined, fallback: string) {
  return jsonResult({ success: false, error: res?.error || fallback });
}

const ProviderSchema = Type.Union([
  Type.Literal('linkedin'),
  Type.Literal('instagram'),
  Type.Literal('x'),
]);

const MediaItemSchema = Type.Object({
  type: Type.Optional(
    Type.Union([Type.Literal('image'), Type.Literal('video'), Type.Literal('reel')]),
  ),
  resource_id: Type.Optional(
    Type.String({ description: 'Dome image/video resource id (from resource_search/resource_list)' }),
  ),
  path: Type.Optional(Type.String({ description: 'Absolute local file path' })),
  url: Type.Optional(Type.String({ description: 'Public https URL' })),
});

export function createSocialAccountsListTool(): AnyAgentTool {
  return {
    label: 'List social accounts',
    name: 'social_accounts_list',
    description:
      'List the connected social accounts (LinkedIn / Instagram / X) with handle and connection status. ' +
      'Call this FIRST when the user asks about their redes sociales, social networks, Instagram, LinkedIn, or X. ' +
      'Do not answer from library search or memory alone. Source: Social hub.',
    parameters: Type.Object({}),
    execute: async () => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const res = await window.electron.invoke('social:accounts:list');
      if (!res?.success) return ipcError(res, 'Failed to list accounts.');
      return jsonResult({ success: true, source: 'social', accounts: res.data ?? [] });
    },
  };
}

export function createSocialPostsListTool(): AnyAgentTool {
  return {
    label: 'List social posts',
    name: 'social_posts_list',
    description:
      'List social media posts (drafts, scheduled queue, published history) with status, schedule, campaign, topics and latest metrics. Source: Social hub.',
    parameters: Type.Object({
      status: Type.Optional(
        Type.Union(
          [
            Type.Literal('draft'),
            Type.Literal('scheduled'),
            Type.Literal('publishing'),
            Type.Literal('published'),
            Type.Literal('failed'),
          ],
          { description: 'Filter by status (omit for all).' },
        ),
      ),
      limit: Type.Optional(Type.Number({ description: 'Max posts (default 50).' })),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const params = args as Record<string, unknown>;
      const status = readStringParam(params, 'status') || undefined;
      const limit = readNumberParam(params, 'limit') ?? 50;
      const res = await window.electron.invoke('social:posts:list', {
        status,
        limit,
      });
      if (!res?.success) return ipcError(res, 'Failed to list posts.');
      return jsonResult({ success: true, source: 'social', posts: res.data ?? [] });
    },
  };
}

export function createSocialPostGetTool(): AnyAgentTool {
  return {
    label: 'Get social post',
    name: 'social_post_get',
    description:
      'Get one social post by id (sp-…). Call this when Source / mentioned-sources lists a social_post, ' +
      'or the user refers to a pinned post chip. Returns full body, provider, status, campaign, media and metrics. ' +
      'Do not claim there is no post if a social_post id is in context — fetch it with this tool. Source: Social hub.',
    parameters: Type.Object({
      post_id: Type.String({
        description: 'Social post id (e.g. sp-… from mentioned-sources).',
      }),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const postId = readStringParam(args as Record<string, unknown>, 'post_id');
      if (!postId) return jsonResult({ success: false, error: 'post_id is required.' });
      const res = await window.electron.invoke('social:posts:get', { postId });
      if (!res?.success) return ipcError(res, 'Failed to get post.');
      return jsonResult({ success: true, source: 'social', post: res.data });
    },
  };
}

export function createSocialMetricsSummaryTool(): AnyAgentTool {
  return {
    label: 'Social metrics summary',
    name: 'social_metrics_summary',
    description:
      'Get the social analytics summary: per-status post counts, 30-day totals (impressions/likes/comments/shares), per-network breakdown, top performing posts and recent posts with their latest metrics. ' +
      'Use this to analyse what content works and ground recommendations. Optionally refresh metrics from the networks first. Source: Social hub.',
    parameters: Type.Object({
      refresh: Type.Optional(
        Type.Boolean({
          description: 'Fetch fresh metrics from the networks before summarising (slower; default false).',
        }),
      ),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const refresh = readBooleanParam(args as Record<string, unknown>, 'refresh') ?? false;
      if (refresh) {
        await window.electron.invoke('social:metrics:refresh');
      }
      const res = await window.electron.invoke('social:summary');
      if (!res?.success) return ipcError(res, 'Failed to get summary.');
      return jsonResult({ success: true, source: 'social', summary: res.data });
    },
  };
}

export function createSocialPostDraftTool(): AnyAgentTool {
  return {
    label: 'Draft social post',
    name: 'social_post_draft',
    description:
      'Create a social media post (draft or scheduled) for LinkedIn, Instagram or X. ' +
      'If scheduled_at is given the post is auto-published at that time; otherwise it is saved as a draft the user can review in the Social tab. ' +
      'Instagram requires at least one media item with a PUBLIC https image/video URL. X is limited to 280 characters. Source: Social hub.',
    parameters: Type.Object({
      provider: ProviderSchema,
      account_id: Type.String({ description: 'Explicit destination account id from social_accounts_list.' }),
      body: Type.String({
        description: 'Post text/caption. Limits: X 280, Instagram 2200, LinkedIn 3000 chars.',
      }),
      media: Type.Optional(Type.Array(MediaItemSchema)),
      link_url: Type.Optional(
        Type.String({ description: 'Optional link to share (LinkedIn article / appended to X text).' }),
      ),
      topics: Type.Optional(
        Type.Array(Type.String(), {
          description: 'Topic tags for performance analysis (e.g. ["ai", "productivity"]).',
        }),
      ),
      campaign: Type.Optional(Type.String({ description: 'Optional campaign name to group posts.' })),
      scheduled_at: Type.Optional(
        Type.String({
          description: 'ISO datetime to auto-publish (e.g. 2026-07-04T09:00:00). Omit to save as draft.',
        }),
      ),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const params = args as Record<string, unknown>;
      const provider = readStringParam(params, 'provider', { required: true });
      const body = readStringParam(params, 'body', { required: true });
      const scheduledRaw = readStringParam(params, 'scheduled_at');
      let scheduledAt: number | null = null;
      if (scheduledRaw) {
        const ms = Date.parse(scheduledRaw);
        if (!Number.isNaN(ms)) scheduledAt = ms;
      }
      const mediaIn = Array.isArray(params.media) ? params.media : [];
      const media = mediaIn
        .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
        .map((m) => ({
          type: typeof m.type === 'string' ? m.type : undefined,
          url: typeof m.url === 'string' ? m.url : undefined,
          path: typeof m.path === 'string' ? m.path : undefined,
          resourceId: typeof m.resource_id === 'string' ? m.resource_id : undefined,
        }));
      const res = await window.electron.invoke('social:posts:create', {
        provider,
        accountId: readStringParam(params, 'account_id', { required: true }),
        body,
        media,
        linkUrl: readStringParam(params, 'link_url') || undefined,
        topics: Array.isArray(params.topics) ? params.topics : [],
        campaign: readStringParam(params, 'campaign') || undefined,
        scheduledAt,
      });
      if (!res?.success) return ipcError(res, 'Failed to create draft.');
      return jsonResult({ success: true, source: 'social', post: res.data });
    },
  };
}

export function createSocialPostPublishTool(): AnyAgentTool {
  return {
    label: 'Publish social post',
    name: 'social_post_publish',
    description:
      "Publish an existing social post (draft/scheduled/failed) to its network RIGHT NOW. " +
      "Irreversible: the content goes live on the user's real account — only call when the user explicitly asked to publish. Source: Social hub.",
    parameters: Type.Object({
      post_id: Type.String({ description: 'Post id from social_post_draft or social_posts_list.' }),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const postId = readStringParam(args as Record<string, unknown>, 'post_id', { required: true });
      const res = await window.electron.invoke('social:posts:publish', { postId });
      if (!res?.success) return ipcError(res, 'Failed to publish.');
      return jsonResult({ success: true, source: 'social', post: res.data });
    },
  };
}

export function createSocialCampaignsListTool(): AnyAgentTool {
  return {
    label: 'List social campaigns',
    name: 'social_campaigns_list',
    description: 'List soft social campaigns with draft/scheduled/published counts. Source: Social hub.',
    parameters: Type.Object({
      status: Type.Optional(Type.Union([Type.Literal('active'), Type.Literal('archived')])),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const status = readStringParam(args as Record<string, unknown>, 'status');
      const res = await window.electron.invoke('social:campaigns:list');
      if (!res?.success) return ipcError(res, 'Failed to list campaigns.');
      let campaigns = res.data ?? [];
      if (status === 'active' || status === 'archived') {
        campaigns = campaigns.filter((c: { status?: string }) => c.status === status);
      }
      return jsonResult({ success: true, source: 'social', campaigns });
    },
  };
}

export function createSocialCampaignCreateTool(): AnyAgentTool {
  return {
    label: 'Create social campaign',
    name: 'social_campaign_create',
    description: 'Create a soft social campaign (name + optional goal). Does not publish posts. Source: Social hub.',
    parameters: Type.Object({
      name: Type.String({ description: 'Unique campaign name.' }),
      goal: Type.Optional(Type.String({ description: 'Short goal / brief.' })),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const params = args as Record<string, unknown>;
      const name = readStringParam(params, 'name', { required: true });
      const res = await window.electron.invoke('social:campaigns:create', {
        name,
        goal: readStringParam(params, 'goal') || null,
      });
      if (!res?.success) return ipcError(res, 'Failed to create campaign.');
      return jsonResult({ success: true, source: 'social', campaign: res.data });
    },
  };
}

export function createSocialGrowthTool(): AnyAgentTool {
  return {
    label: 'Social growth',
    name: 'social_growth',
    description:
      'Follower growth series and deltas per account. LinkedIn personal profiles may set followersUnavailable. Source: Social hub.',
    parameters: Type.Object({
      days: Type.Optional(Type.Number()),
      refresh: Type.Optional(Type.Boolean()),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const params = args as Record<string, unknown>;
      const refresh = readBooleanParam(params, 'refresh') ?? false;
      if (refresh) await window.electron.invoke('social:metrics:refresh');
      const days = typeof params.days === 'number' ? params.days : 90;
      const res = await window.electron.invoke('social:growth', { days });
      if (!res?.success) return ipcError(res, 'Failed to get growth.');
      return jsonResult({ success: true, source: 'social', ...(res.data || {}) });
    },
  };
}

export function createSocialPublicResolveTool(): AnyAgentTool {
  return {
    label: 'Resolve public social URL',
    name: 'social_public_resolve',
    description:
      'Resolve a public Instagram, X or LinkedIn profile/post URL into a structured card with honest limitations. Source: Social hub.',
    parameters: Type.Object({
      url: Type.String({ description: 'Public https URL.' }),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const url = readStringParam(args as Record<string, unknown>, 'url', { required: true });
      const res = await window.electron.invoke('social:public:resolve', { url });
      if (!res?.success) return ipcError(res, 'Failed to resolve URL.');
      return jsonResult({ success: true, source: 'social_public', ...(res.data || {}) });
    },
  };
}

export function createSocialReferenceSaveTool(): AnyAgentTool {
  return {
    label: 'Save social reference',
    name: 'social_reference_save',
    description: 'Save a third-party social URL as a reference. Source: Social hub.',
    parameters: Type.Object({
      url: Type.String(),
      notes: Type.Optional(Type.String()),
      collection_id: Type.Optional(Type.String()),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const params = args as Record<string, unknown>;
      const res = await window.electron.invoke('social:references:capture', {
        url: readStringParam(params, 'url', { required: true }),
        notes: readStringParam(params, 'notes') || null,
        collectionId: readStringParam(params, 'collection_id') || null,
      });
      if (!res?.success) return ipcError(res, 'Failed to save reference.');
      return jsonResult({ success: true, source: 'social', ...(res.data || {}) });
    },
  };
}

export function createSocialReferenceListTool(): AnyAgentTool {
  return {
    label: 'List social references',
    name: 'social_reference_list',
    description: 'List saved social references. Source: Social hub.',
    parameters: Type.Object({
      limit: Type.Optional(Type.Number()),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const limit = readNumberParam(args as Record<string, unknown>, 'limit') ?? 40;
      const res = await window.electron.invoke('social:references:list', { limit });
      if (!res?.success) return ipcError(res, 'Failed to list references.');
      return jsonResult({ success: true, source: 'social', references: res.data ?? [] });
    },
  };
}

export function createSocialWatchlistsListTool(): AnyAgentTool {
  return {
    label: 'List watchlists',
    name: 'social_watchlists_list',
    description: 'List social watchlists and members. Source: Social hub.',
    parameters: Type.Object({}),
    execute: async () => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const res = await window.electron.invoke('social:watchlists:list');
      if (!res?.success) return ipcError(res, 'Failed to list watchlists.');
      return jsonResult({ success: true, source: 'social', watchlists: res.data ?? [] });
    },
  };
}

export function createSocialWatchlistAddTool(): AnyAgentTool {
  return {
    label: 'Add watchlist member',
    name: 'social_watchlist_add',
    description: 'Add a competitor, inspiration or followed profile to a watchlist. Source: Social hub.',
    parameters: Type.Object({
      watchlist_id: Type.Optional(Type.String()),
      kind: Type.Optional(
        Type.Union([
          Type.Literal('competitor'),
          Type.Literal('inspiration'),
          Type.Literal('following'),
          Type.Literal('custom'),
        ]),
      ),
      url: Type.Optional(Type.String()),
      handle: Type.Optional(Type.String()),
      provider: Type.Optional(ProviderSchema),
      display_name: Type.Optional(Type.String()),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const params = args as Record<string, unknown>;
      const lists = await window.electron.invoke('social:watchlists:list');
      if (!lists?.success) return ipcError(lists, 'Failed to list watchlists.');
      const kind = readStringParam(params, 'kind');
      const watchlistId = readStringParam(params, 'watchlist_id');
      const match = Array.isArray(lists.data)
        ? lists.data.find((item: { id?: string; kind?: string }) =>
            watchlistId ? item.id === watchlistId : item.kind === kind,
          )
        : null;
      if (!match?.id) return jsonResult({ success: false, error: 'Watchlist not found.' });
      const res = await window.electron.invoke('social:watchlists:add-member', {
        watchlistId: match.id,
        profileUrl: readStringParam(params, 'url') || undefined,
        handle: readStringParam(params, 'handle') || undefined,
        provider: readStringParam(params, 'provider') || undefined,
        displayName: readStringParam(params, 'display_name') || undefined,
      });
      if (!res?.success) return ipcError(res, 'Failed to add watchlist member.');
      return jsonResult({ success: true, source: 'social', watchlist: res.data });
    },
  };
}

export function createSocialCompetitiveReportTool(): AnyAgentTool {
  return {
    label: 'Competitive report',
    name: 'social_competitive_report',
    description: 'Compare own posts with saved references. Source: Social hub.',
    parameters: Type.Object({
      watchlist_id: Type.Optional(Type.String()),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const res = await window.electron.invoke('social:reports:competitive', {
        watchlistId: readStringParam(args as Record<string, unknown>, 'watchlist_id') || undefined,
      });
      if (!res?.success) return ipcError(res, 'Failed to generate competitive report.');
      return jsonResult({ success: true, source: 'social', ...(res.data || {}) });
    },
  };
}

export function createSocialTrendsSnapshotTool(): AnyAgentTool {
  return {
    label: 'Social trends',
    name: 'social_trends_snapshot',
    description: 'Derive trend signals from own posts and saved references. Source: Social hub.',
    parameters: Type.Object({
      window_days: Type.Optional(Type.Number()),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const windowDays = readNumberParam(args as Record<string, unknown>, 'window_days') ?? 30;
      const res = await window.electron.invoke('social:trends:snapshot', { windowDays });
      if (!res?.success) return ipcError(res, 'Failed to snapshot trends.');
      return jsonResult({ success: true, source: 'social', ...(res.data || {}) });
    },
  };
}

export function createSocialCampaignFromReferencesTool(): AnyAgentTool {
  return {
    label: 'Campaign from references',
    name: 'social_campaign_from_references',
    description: 'Create a campaign and attach saved references as inspiration. Source: Social hub.',
    parameters: Type.Object({
      name: Type.String(),
      goal: Type.Optional(Type.String()),
      reference_ids: Type.Optional(Type.Array(Type.String())),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const params = args as Record<string, unknown>;
      const name = readStringParam(params, 'name', { required: true });
      const created = await window.electron.invoke('social:campaigns:create', {
        name,
        goal: readStringParam(params, 'goal') || null,
      });
      if (!created?.success) return ipcError(created, 'Failed to create campaign.');
      const ids = Array.isArray(params.reference_ids) ? params.reference_ids.map(String) : [];
      for (const referenceId of ids) {
        await window.electron.invoke('social:campaigns:references:link', {
          campaignId: created.data?.id,
          referenceId,
        });
      }
      return jsonResult({ success: true, source: 'social', campaign: created.data, referenceIds: ids });
    },
  };
}

export function createSocialTools(): AnyAgentTool[] {
  return [
    createSocialAccountsListTool(),
    createSocialPostsListTool(),
    createSocialPostGetTool(),
    createSocialMetricsSummaryTool(),
    createSocialPostDraftTool(),
    createSocialPostPublishTool(),
    createSocialCampaignsListTool(),
    createSocialCampaignCreateTool(),
    createSocialGrowthTool(),
    createSocialPublicResolveTool(),
    createSocialReferenceSaveTool(),
    createSocialReferenceListTool(),
    createSocialWatchlistsListTool(),
    createSocialWatchlistAddTool(),
    createSocialCompetitiveReportTool(),
    createSocialTrendsSnapshotTool(),
    createSocialCampaignFromReferencesTool(),
  ];
}
