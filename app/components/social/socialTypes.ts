export type SocialProvider = 'linkedin' | 'instagram' | 'x';

export interface SocialAccount {
  id: string;
  provider: SocialProvider;
  /** LinkedIn: 'organization' = company page; everything else is 'member'. */
  accountKind: 'member' | 'organization';
  displayName: string | null;
  handle: string | null;
  externalId: string | null;
  status: 'active' | 'error' | 'expired';
  lastError: string | null;
  connectedAt: number | null;
  lastSyncAt: number | null;
  cloudPublishing?: boolean;
}

export interface SocialMediaItem {
  type?: 'image' | 'video' | 'reel';
  /** Public https URL (only path Instagram photos accept). */
  url?: string;
  /** Local file picked from the user's machine. */
  path?: string;
  /** Dome vault image/video resource. */
  resourceId?: string;
  /** Display name (file basename or resource title). */
  name?: string;
}

export interface SocialLibraryItem {
  resourceId: string;
  title: string;
  type: 'image' | 'video';
  /** Vault folder path ("images / p1"); empty for root-level items. */
  folderPath?: string;
}

export interface SocialMetric {
  id: string;
  postId: string;
  capturedAt: number;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  followers: number | null;
}

export interface SocialPost {
  id: string;
  accountId: string | null;
  provider: SocialProvider;
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
  body: string;
  media: SocialMediaItem[];
  linkUrl: string | null;
  topics: string[];
  campaign: string | null;
  scheduledAt: number | null;
  publishedAt: number | null;
  externalPostId: string | null;
  externalUrl: string | null;
  error: string | null;
  createdBy: string;
  groupId: string | null;
  createdAt: number;
  updatedAt: number;
  /** Present in summary responses (latest snapshot). */
  metrics?: SocialMetric | null;
}

export interface SocialSummary {
  accounts: SocialAccount[];
  counts: Record<'draft' | 'scheduled' | 'publishing' | 'published' | 'failed', number>;
  totals: { impressions: number; likes: number; comments: number; shares: number; saves: number };
  byProvider: Partial<Record<SocialProvider, { posts: number; impressions: number; likes: number; comments: number }>>;
  recentPosts: SocialPost[];
  topPosts: SocialPost[];
}

export interface SocialAccountMetric {
  id: string;
  accountId: string;
  capturedAt: number;
  followers: number | null;
  following: number | null;
  postsCount: number | null;
}

export interface SocialGrowthAccount {
  accountId: string;
  provider: SocialProvider;
  accountKind?: 'member' | 'organization';
  displayName: string | null;
  handle: string | null;
  status: 'active' | 'error' | 'expired';
  latest: SocialAccountMetric | null;
  points: { t: number; followers: number | null }[];
  delta: number | null;
}

export interface SocialReport {
  id: string;
  status: 'generating' | 'ready' | 'failed';
  trigger: 'user' | 'auto';
  periodDays: number;
  title: string | null;
  content: string | null;
  model: string | null;
  error: string | null;
  data: {
    accounts?: { provider: SocialProvider; handle: string | null; followersNow: number | null; followersDelta: number | null }[];
    postsInPeriod?: number;
  } | null;
  createdAt: number;
  completedAt: number | null;
}

export interface SocialReportConfig {
  intervalHours: number;
  periodDays: number;
  language: 'es' | 'en' | 'fr' | 'pt';
}

export const PROVIDER_CHAR_LIMITS: Record<SocialProvider, number> = {
  linkedin: 3000,
  instagram: 2200,
  x: 280,
};
