export type SocialProvider = 'linkedin' | 'instagram' | 'x';

export interface SocialAccount {
  id: string;
  provider: SocialProvider;
  displayName: string | null;
  handle: string | null;
  externalId: string | null;
  status: 'active' | 'error' | 'expired';
  lastError: string | null;
  connectedAt: number | null;
  lastSyncAt: number | null;
}

export interface SocialMediaItem {
  type?: 'image' | 'video' | 'reel';
  url: string;
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

export const PROVIDER_CHAR_LIMITS: Record<SocialProvider, number> = {
  linkedin: 3000,
  instagram: 2200,
  x: 280,
};
