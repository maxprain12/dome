import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Bookmark01Icon, BubbleChatIcon, Film01Icon, GlobeIcon, HeartIcon, Image01Icon, RepeatIcon, SentIcon, Share08Icon, ThumbsUpIcon } from '@hugeicons/core-free-icons';
import type { SocialAccount, SocialMediaItem, SocialProvider } from '@/components/social/socialTypes';

export type SocialPostFormat = 'post' | 'image' | 'carousel' | 'article' | 'reel' | 'video';

export const PROVIDER_FORMATS: Record<SocialProvider, SocialPostFormat[]> = {
  linkedin: ['post', 'image', 'carousel', 'article'],
  instagram: ['post', 'reel'],
  x: ['post', 'image', 'video'],
};

/** Pick the format that matches the current content when the user hasn't chosen one. */
export function deriveFormat(
  provider: SocialProvider,
  media: SocialMediaItem[],
  linkUrl: string,
): SocialPostFormat {
  const hasVideo = media.some((m) => m.type === 'video' || m.type === 'reel');
  if (provider === 'instagram') return hasVideo ? 'reel' : 'post';
  if (provider === 'x') return hasVideo ? 'video' : media.length > 0 ? 'image' : 'post';
  if (media.length > 1) return 'carousel';
  if (media.length === 1) return 'image';
  if (linkUrl) return 'article';
  return 'post';
}

interface Props {
  provider: SocialProvider;
  format: SocialPostFormat;
  body: string;
  media: SocialMediaItem[];
  linkUrl: string;
  account: SocialAccount | null;
  /** media key → image data URL for real thumbnails (images only). */
  thumbnails: Record<string, string>;
}

export function mediaKey(m: SocialMediaItem): string {
  return m.resourceId ?? m.path ?? m.url ?? '';
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className="flex items-center justify-center rounded-full shrink-0 font-semibold"
      style={{
        width: size,
        height: size,
        background: 'var(--primary)',
        color: 'white',
        fontSize: size * 0.42,
      }}
    >
      {initial}
    </div>
  );
}

function MediaThumb({
  item,
  thumbnails,
  className,
  style,
}: {
  item: SocialMediaItem | undefined;
  thumbnails: Record<string, string>;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = item ? thumbnails[mediaKey(item)] : undefined;
  const isVideo = item?.type === 'video' || item?.type === 'reel';
  // Public video URLs (e.g. signed MinIO/S3 links) can't render in an <img> —
  // use a real <video> so the first frame shows as the preview.
  const videoSrc = isVideo && item?.url ? item.url : undefined;
  const failed = failedSrc != null && failedSrc === (videoSrc ?? src);
  return (
    <div
      className={`flex items-center justify-center overflow-hidden ${className ?? ''}`}
      style={{ background: 'var(--muted, var(--card))', ...style }}
    >
      {videoSrc && !failed ? (
        <video
          src={videoSrc}
          muted
          playsInline
          preload="metadata"
          className="w-full h-full object-cover"
          onError={() => setFailedSrc(videoSrc)}
        />
      ) : src && !failed ? (
        <img src={src} alt="" className="w-full h-full object-cover" onError={() => setFailedSrc(src)} />
      ) : isVideo ? (
        <HugeiconsIcon icon={Film01Icon} className="size-6 text-muted-foreground" />
      ) : (
        <HugeiconsIcon icon={Image01Icon} className="size-6 text-muted-foreground" />
      )}
    </div>
  );
}

function MediaGrid({ media, thumbnails, max }: { media: SocialMediaItem[]; thumbnails: Record<string, string>; max: number }) {
  const items = media.slice(0, max);
  if (items.length === 0) return null;
  const cols = items.length === 1 ? 1 : 2;
  return (
    <div
      className="grid gap-0.5 rounded-lg overflow-hidden mt-2"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {items.map((m, i) => (
        <MediaThumb
          key={`${mediaKey(m)}-${i}`}
          item={m}
          thumbnails={thumbnails}
          style={{ aspectRatio: items.length === 1 ? '16/9' : '1/1' }}
        />
      ))}
    </div>
  );
}

function linkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Network-styled mock of how the post will look. Purely presentational. */
export default function SocialPostPreview({ provider, format, body, media, linkUrl, account, thumbnails }: Props) {
  const { t } = useTranslation();
  const name = account?.displayName || account?.handle || t('social.preview.your_account');
  const handle = account?.handle || '@you';
  const text = body.trim();
  const firstMedia = media[0];

  // ── Instagram Reel: vertical 9:16 phone frame ─────────────────────────────
  if (provider === 'instagram' && format === 'reel') {
    return (
      <div
        className="relative rounded-xl overflow-hidden mx-auto"
        style={{ aspectRatio: '9/16', maxHeight: 380, width: 'auto', background: 'var(--muted, var(--card))', border: '1px solid var(--border)' }}
      >
        <MediaThumb item={firstMedia} thumbnails={thumbnails} className="absolute inset-0" style={{ background: 'transparent' }} />
        {/* Right action rail */}
        <div className="absolute right-2 bottom-16 flex flex-col items-center gap-3">
          {[HeartIcon, BubbleChatIcon, SentIcon].map((icon, i) => (
            <HugeiconsIcon key={i} icon={icon} className="size-5" style={{ color: 'white', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }} />
          ))}
        </div>
        {/* Bottom caption overlay */}
        <div
          className="absolute inset-x-0 bottom-0 p-3 pt-8"
          style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.65))' }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Avatar name={name} size={22} />
            <span className="text-xs font-semibold" style={{ color: 'white' }}>{handle}</span>
          </div>
          <p className="text-[11px] leading-snug line-clamp-2" style={{ color: 'rgba(255,255,255,0.92)' }}>
            {text || t('social.preview.caption_placeholder')}
          </p>
        </div>
      </div>
    );
  }

  // ── Instagram feed post: square card ──────────────────────────────────────
  if (provider === 'instagram') {
    return (
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--background)' }}>
        <div className="flex items-center gap-2 px-3 py-2">
          <Avatar name={name} size={26} />
          <span className="text-xs font-semibold text-foreground">{handle}</span>
        </div>
        <MediaThumb item={firstMedia} thumbnails={thumbnails} style={{ aspectRatio: '1/1' }} />
        <div className="px-3 py-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <HugeiconsIcon icon={HeartIcon} className="size-4 text-foreground" />
            <HugeiconsIcon icon={BubbleChatIcon} className="size-4 text-foreground" />
            <HugeiconsIcon icon={SentIcon} className="size-4 text-foreground" />
            <HugeiconsIcon icon={Bookmark01Icon} className="size-4 ml-auto text-foreground" />
          </div>
          <p className="text-xs leading-snug text-foreground">
            <span className="font-semibold">{handle}</span>{' '}
            <span className="line-clamp-3">{text || t('social.preview.caption_placeholder')}</span>
          </p>
        </div>
      </div>
    );
  }

  // ── LinkedIn card ──────────────────────────────────────────────────────────
  if (provider === 'linkedin') {
    return (
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--background)' }}>
        <div className="flex items-start gap-2 px-3 pt-3">
          <Avatar name={name} size={34} />
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate text-foreground">{name}</div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              {t('social.preview.now')} · <HugeiconsIcon icon={GlobeIcon} className="size-2.5" />
            </div>
          </div>
        </div>
        <p className="px-3 pt-2 text-xs leading-snug whitespace-pre-wrap line-clamp-5 text-foreground">
          {text || t('social.preview.text_placeholder')}
        </p>
        <div className="px-3 pb-1">
          {format === 'article' && linkUrl ? (
            <div className="rounded-lg overflow-hidden mt-2" style={{ border: '1px solid var(--border)' }}>
              <div style={{ aspectRatio: '1.91/1', background: 'var(--muted, var(--card))' }} className="flex items-center justify-center">
                <HugeiconsIcon icon={GlobeIcon} className="size-6 text-muted-foreground" />
              </div>
              <div className="px-2.5 py-1.5" style={{ background: 'var(--card)' }}>
                <div className="text-[11px] font-semibold truncate text-foreground">{linkDomain(linkUrl)}</div>
                <div className="text-[10px] text-muted-foreground">{linkUrl.slice(0, 60)}</div>
              </div>
            </div>
          ) : format === 'carousel' ? (
            <div className="flex gap-1.5 mt-2 overflow-hidden">
              {(media.length > 0 ? media.slice(0, 3) : [undefined, undefined]).map((m, i) => (
                <MediaThumb
                  key={m ? `${mediaKey(m)}-${i}` : i}
                  item={m}
                  thumbnails={thumbnails}
                  className="rounded-lg shrink-0"
                  style={{ width: '72%', aspectRatio: '1/1' }}
                />
              ))}
            </div>
          ) : format === 'image' ? (
            <MediaGrid media={media.length > 0 ? media : []} thumbnails={thumbnails} max={4} />
          ) : null}
        </div>
        <div
          className="flex items-center justify-around px-3 py-1.5 mt-1 text-[10px]"
          style={{ borderTop: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
        >
          <span className="flex items-center gap-1"><HugeiconsIcon icon={ThumbsUpIcon} className="size-3" />{t('social.preview.like')}</span>
          <span className="flex items-center gap-1"><HugeiconsIcon icon={BubbleChatIcon} className="size-3" />{t('social.preview.comment')}</span>
          <span className="flex items-center gap-1"><HugeiconsIcon icon={RepeatIcon} className="size-3" />{t('social.preview.repost')}</span>
          <span className="flex items-center gap-1"><HugeiconsIcon icon={SentIcon} className="size-3" />{t('social.preview.send')}</span>
        </div>
      </div>
    );
  }

  // ── X tweet card ───────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl px-3 py-3" style={{ border: '1px solid var(--border)', background: 'var(--background)' }}>
      <div className="flex items-start gap-2">
        <Avatar name={name} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold truncate text-foreground">{name}</span>
            <span className="truncate text-muted-foreground">{handle} · {t('social.preview.now')}</span>
          </div>
          <p className="text-xs leading-snug whitespace-pre-wrap mt-0.5 text-foreground">
            {text || t('social.preview.text_placeholder')}
            {linkUrl ? <span className="text-primary"> {linkUrl.slice(0, 40)}</span> : null}
          </p>
          {format === 'video' ? (
            <div className="rounded-lg overflow-hidden mt-2 relative" style={{ aspectRatio: '16/9' }}>
              <MediaThumb item={media.find((m) => m.type === 'video') ?? firstMedia} thumbnails={thumbnails} className="absolute inset-0" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-full p-2.5" style={{ background: 'rgba(0,0,0,0.55)' }}>
                  <HugeiconsIcon icon={Film01Icon} className="size-4" style={{ color: 'white' }} />
                </div>
              </div>
            </div>
          ) : (
            <MediaGrid media={format === 'image' ? media : []} thumbnails={thumbnails} max={4} />
          )}
          <div className="flex items-center justify-between mt-2 pr-6 text-muted-foreground">
            <HugeiconsIcon icon={BubbleChatIcon} className="size-3.5" />
            <HugeiconsIcon icon={RepeatIcon} className="size-3.5" />
            <HugeiconsIcon icon={HeartIcon} className="size-3.5" />
            <HugeiconsIcon icon={Share08Icon} className="size-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
