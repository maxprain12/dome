/**
 * @dome/tools — `social` family definitions (domains/social/*).
 */

import type { ToolDefinition } from '../types.js';
import { socialAccountsListDefinition } from '../domains/social/social_accounts_list/definition.js';
import { socialPostDraftDefinition } from '../domains/social/social_post_draft/definition.js';
import { socialPostPublishDefinition } from '../domains/social/social_post_publish/definition.js';
import { socialPostsListDefinition } from '../domains/social/social_posts_list/definition.js';
import { socialPostGetDefinition } from '../domains/social/social_post_get/definition.js';
import { socialMetricsSummaryDefinition } from '../domains/social/social_metrics_summary/definition.js';
import { socialCampaignsListDefinition } from '../domains/social/social_campaigns_list/definition.js';
import { socialCampaignCreateDefinition } from '../domains/social/social_campaign_create/definition.js';
import { socialGrowthDefinition } from '../domains/social/social_growth/definition.js';
import { socialPublicResolveDefinition } from '../domains/social/social_public_resolve/definition.js';
import { socialReferenceSaveDefinition } from '../domains/social/social_reference_save/definition.js';
import { socialReferenceListDefinition } from '../domains/social/social_reference_list/definition.js';
import { socialWatchlistsListDefinition } from '../domains/social/social_watchlists_list/definition.js';
import { socialWatchlistAddDefinition } from '../domains/social/social_watchlist_add/definition.js';
import { socialCompetitiveReportDefinition } from '../domains/social/social_competitive_report/definition.js';
import { socialTrendsSnapshotDefinition } from '../domains/social/social_trends_snapshot/definition.js';
import { socialCampaignFromReferencesDefinition } from '../domains/social/social_campaign_from_references/definition.js';

export const SOCIAL_TOOL_NAMES = [
  'social_accounts_list',
  'social_post_draft',
  'social_post_publish',
  'social_posts_list',
  'social_post_get',
  'social_metrics_summary',
  'social_campaigns_list',
  'social_campaign_create',
  'social_growth',
  'social_public_resolve',
  'social_reference_save',
  'social_reference_list',
  'social_watchlists_list',
  'social_watchlist_add',
  'social_competitive_report',
  'social_trends_snapshot',
  'social_campaign_from_references',
] as const;

export type SocialToolName = (typeof SOCIAL_TOOL_NAMES)[number];

export function socialToolDefinitions(): ToolDefinition[] {
  return [
    socialAccountsListDefinition,
    socialPostDraftDefinition,
    socialPostPublishDefinition,
    socialPostsListDefinition,
    socialPostGetDefinition,
    socialMetricsSummaryDefinition,
    socialCampaignsListDefinition,
    socialCampaignCreateDefinition,
    socialGrowthDefinition,
    socialPublicResolveDefinition,
    socialReferenceSaveDefinition,
    socialReferenceListDefinition,
    socialWatchlistsListDefinition,
    socialWatchlistAddDefinition,
    socialCompetitiveReportDefinition,
    socialTrendsSnapshotDefinition,
    socialCampaignFromReferencesDefinition,
  ];
}
