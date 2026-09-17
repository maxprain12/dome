import { socialWebUrl } from '@/components/social/workspace/SocialPostPreview';

export type CoverMediaItem = {
  type?: string;
  url?: string;
  thumbnailUrl?: string;
};

export function socialCoverSrc(
  media?: CoverMediaItem[] | null,
  format?: string | null,
): string | null {
  const item = media?.[0];
  if (!item) return null;
  const isMotion = item.type === 'video' || item.type === 'reel' || format === 'reel';
  const raw = isMotion ? item.thumbnailUrl || item.url : item.url || item.thumbnailUrl;
  return socialWebUrl(raw) ?? null;
}

function coverDedupeKey(src: string): string {
  try {
    const url = new URL(src);
    return `${url.origin}${url.pathname}`;
  } catch {
    return src;
  }
}

export function coversFromPosts(
  posts: Array<{ media?: CoverMediaItem[] | null; format?: string | null }>,
  limit = 3,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const post of posts) {
    const media = (post.media || []).filter((item) => item.url || item.thumbnailUrl);
    for (const item of media) {
      const src = socialCoverSrc([item], post.format);
      if (!src) continue;
      const key = coverDedupeKey(src);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(src);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
