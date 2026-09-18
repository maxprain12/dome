import { unwrapToolResultObject } from './toolResultParsers';
import type { SocialPost, SocialProvider } from '@/components/social/socialTypes';
import {
  postToEvidenceCard,
  type SocialCardFetchMethod,
  type SocialCardLimitation,
  type SocialEvidenceCardModel,
} from '@/components/social/cards/socialCardModel';

const PROVIDERS = new Set(['linkedin', 'instagram', 'x']);

function asProvider(value: unknown): SocialProvider | null {
  return typeof value === 'string' && PROVIDERS.has(value) ? (value as SocialProvider) : null;
}

function asLimitations(value: unknown): SocialCardLimitation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SocialCardLimitation =>
      item === 'og_only' ||
      item === 'metrics_unavailable' ||
      item === 'requires_browser' ||
      item === 'login_wall' ||
      item === 'local_only',
  );
}

function publicCardToModel(card: Record<string, unknown>): SocialEvidenceCardModel | null {
  const provider = asProvider(card.provider);
  if (!provider) return null;
  const kind = card.kind === 'profile' ? 'profile' : 'post';
  const authorRaw = card.author && typeof card.author === 'object' ? (card.author as Record<string, unknown>) : {};
  const name =
    String(authorRaw.name || authorRaw.handle || card.title || '').trim() || provider;
  return {
    kind,
    provider,
    title: name,
    body: typeof card.body === 'string' ? card.body : typeof card.bio === 'string' ? card.bio : null,
    url: typeof card.url === 'string' ? card.url : null,
    author: {
      name,
      handle: typeof authorRaw.handle === 'string' ? authorRaw.handle : null,
      avatarUrl: typeof authorRaw.avatarUrl === 'string' ? authorRaw.avatarUrl : null,
    },
    media: Array.isArray(card.media) ? (card.media as SocialEvidenceCardModel['media']) : [],
    metrics: card.metrics && typeof card.metrics === 'object' ? (card.metrics as SocialEvidenceCardModel['metrics']) : null,
    followers: typeof card.followers === 'number' ? card.followers : null,
    following: typeof card.following === 'number' ? card.following : null,
    postsCount: typeof card.postsCount === 'number' ? card.postsCount : null,
    format: typeof card.format === 'string' ? card.format : null,
    publishedAt: typeof card.publishedAt === 'number' ? card.publishedAt : null,
    limitations: asLimitations(card.limitations),
    fetchMethod: (typeof card.fetchMethod === 'string' ? card.fetchMethod : 'open_graph') as SocialCardFetchMethod,
    topics: Array.isArray(card.topics) ? card.topics.map(String) : [],
  };
}

function accountToProfile(account: Record<string, unknown>): SocialEvidenceCardModel | null {
  const provider = asProvider(account.provider);
  if (!provider) return null;
  const name = String(account.displayName || account.handle || provider).trim();
  return {
    kind: 'profile',
    provider,
    title: name,
    body: null,
    url: null,
    author: {
      name,
      handle: typeof account.handle === 'string' ? account.handle : null,
      avatarUrl: typeof account.avatarUrl === 'string' ? account.avatarUrl : null,
    },
    followers: typeof account.followers === 'number' ? account.followers : null,
    following: typeof account.following === 'number' ? account.following : null,
    postsCount: typeof account.postsCount === 'number' ? account.postsCount : null,
    limitations: [],
    fetchMethod: 'connected_account',
  };
}

export type SocialToolResultView =
  | { type: 'profile'; model: SocialEvidenceCardModel }
  | { type: 'post'; model: SocialEvidenceCardModel }
  | { type: 'profiles'; models: SocialEvidenceCardModel[] }
  | { type: 'posts'; models: SocialEvidenceCardModel[] };

export function parseSocialToolResult(toolName: string, result: unknown): SocialToolResultView | null {
  const name = String(toolName || '').toLowerCase();
  if (!name.startsWith('social_') && name !== 'browser_extract_social') return null;
  const obj = unwrapToolResultObject(result);
  if (!obj || obj.success === false) return null;

  if (obj.card && typeof obj.card === 'object') {
    const model = publicCardToModel(obj.card as Record<string, unknown>);
    if (!model) return null;
    return { type: model.kind === 'profile' ? 'profile' : 'post', model };
  }

  if (obj.reference && typeof obj.reference === 'object') {
    const model = publicCardToModel(obj.reference as Record<string, unknown>);
    if (!model) return null;
    return { type: model.kind === 'profile' ? 'profile' : 'post', model };
  }

  if (obj.post && typeof obj.post === 'object') {
    return { type: 'post', model: postToEvidenceCard(obj.post as SocialPost) };
  }

  if (Array.isArray(obj.posts) && obj.posts.length > 0) {
    const models = obj.posts
      .filter((item): item is SocialPost => Boolean(item) && typeof item === 'object')
      .slice(0, 4)
      .map((post) => postToEvidenceCard(post));
    if (models.length === 0) return null;
    return models.length === 1 ? { type: 'post', model: models[0] } : { type: 'posts', models };
  }

  if (Array.isArray(obj.references) && obj.references.length > 0) {
    const models = obj.references
      .map((item) => (item && typeof item === 'object' ? publicCardToModel(item as Record<string, unknown>) : null))
      .filter((item): item is SocialEvidenceCardModel => item != null)
      .slice(0, 4);
    if (models.length === 0) return null;
    return models.length === 1 ? { type: models[0].kind === 'profile' ? 'profile' : 'post', model: models[0] } : { type: 'posts', models };
  }

  if (Array.isArray(obj.accounts) && obj.accounts.length > 0) {
    const models = obj.accounts
      .map((item) => (item && typeof item === 'object' ? accountToProfile(item as Record<string, unknown>) : null))
      .filter((item): item is SocialEvidenceCardModel => item != null)
      .slice(0, 6);
    if (models.length === 0) return null;
    return models.length === 1 ? { type: 'profile', model: models[0] } : { type: 'profiles', models };
  }

  if (obj.account && typeof obj.account === 'object') {
    const model = accountToProfile(obj.account as Record<string, unknown>);
    if (!model) return null;
    return { type: 'profile', model };
  }

  return null;
}

export function isSocialToolName(name: string): boolean {
  const n = String(name || '').toLowerCase();
  return n.startsWith('social_') || n === 'browser_extract_social';
}
