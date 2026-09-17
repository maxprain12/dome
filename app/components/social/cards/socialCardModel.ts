import type {
  SocialAccount,
  SocialMediaItem,
  SocialMetric,
  SocialPost,
  SocialProvider,
} from '@/components/social/socialTypes';

export type SocialCardLimitation =
  | 'og_only'
  | 'metrics_unavailable'
  | 'requires_browser'
  | 'login_wall'
  | 'local_only';

export type SocialCardFetchMethod =
  | 'connected_account'
  | 'official_api'
  | 'open_graph'
  | 'user_browser'
  | 'manual';

export type SocialEvidenceKind = 'profile' | 'post';

export interface SocialEvidenceAuthor {
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
}

export interface SocialEvidenceCardModel {
  kind: SocialEvidenceKind;
  provider: SocialProvider;
  title: string;
  body?: string | null;
  url?: string | null;
  author: SocialEvidenceAuthor;
  media?: SocialMediaItem[];
  metrics?: Partial<SocialMetric> | null;
  followers?: number | null;
  following?: number | null;
  postsCount?: number | null;
  format?: string | null;
  publishedAt?: number | null;
  limitations: SocialCardLimitation[];
  fetchMethod: SocialCardFetchMethod;
  topics?: string[];
}

export function accountDisplayName(account: Pick<SocialAccount, 'displayName' | 'handle' | 'provider'>): string {
  return account.displayName || account.handle || account.provider;
}

export function postToEvidenceCard(
  post: SocialPost,
  account?: SocialAccount | null,
): SocialEvidenceCardModel {
  const authorName =
    post.source?.authorName ||
    account?.displayName ||
    account?.handle ||
    post.provider;
  return {
    kind: 'post',
    provider: post.provider,
    title: authorName,
    body: post.body,
    url: post.externalUrl,
    author: {
      name: authorName,
      handle: post.source?.authorHandle || account?.handle,
      avatarUrl: post.source?.avatarUrl || account?.avatarUrl || null,
    },
    media: post.media,
    metrics: post.metrics ?? null,
    format: post.source?.format ?? null,
    publishedAt: post.publishedAt ?? post.scheduledAt ?? post.updatedAt,
    limitations: post.metrics ? [] : post.status === 'published' ? ['metrics_unavailable'] : ['local_only'],
    fetchMethod: 'connected_account',
    topics: post.topics,
  };
}

const PROVIDERS = new Set(['linkedin', 'instagram', 'x']);

function asLimitation(value: unknown): SocialCardLimitation | null {
  if (
    value === 'og_only' ||
    value === 'metrics_unavailable' ||
    value === 'requires_browser' ||
    value === 'login_wall' ||
    value === 'local_only'
  ) {
    return value;
  }
  return null;
}

export function publicCardToModelSafe(input: {
  provider?: string;
  kind?: string;
  format?: string | null;
  url?: string | null;
  title?: string;
  body?: string | null;
  author?: { name?: string | null; handle?: string | null; avatarUrl?: string | null };
  media?: SocialMediaItem[];
  metrics?: Partial<SocialMetric> | null;
  limitations?: string[];
  sourceKind?: string;
  topics?: string[];
  followers?: number | null;
  following?: number | null;
  postsCount?: number | null;
  publishedAt?: number | null;
}): SocialEvidenceCardModel | null {
  const provider = input.provider && PROVIDERS.has(input.provider) ? (input.provider as SocialProvider) : null;
  if (!provider) return null;
  const name = String(input.author?.name || input.title || provider).trim() || provider;
  const fetchMethod: SocialCardFetchMethod =
    input.sourceKind === 'connected_account' ||
    input.sourceKind === 'official_api' ||
    input.sourceKind === 'open_graph' ||
    input.sourceKind === 'user_browser' ||
    input.sourceKind === 'manual'
      ? input.sourceKind === 'manual'
        ? 'manual'
        : input.sourceKind
      : 'open_graph';
  return {
    kind: input.kind === 'profile' || input.format === 'profile' ? 'profile' : 'post',
    provider,
    title: name,
    body: input.body ?? null,
    url: input.url ?? null,
    author: {
      name,
      handle: input.author?.handle ?? null,
      avatarUrl: input.author?.avatarUrl ?? null,
    },
    media: input.media ?? [],
    metrics: input.metrics ?? null,
    followers: input.followers ?? null,
    following: input.following ?? null,
    postsCount: input.postsCount ?? null,
    format: input.format ?? null,
    publishedAt: input.publishedAt ?? null,
    limitations: (input.limitations || []).map(asLimitation).filter((item): item is SocialCardLimitation => item != null),
    fetchMethod,
    topics: input.topics,
  };
}
