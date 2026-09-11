import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, ArrowRight01Icon, BubbleChatIcon, FavouriteIcon, Share01Icon, ViewIcon, Bookmark01Icon, ExternalLinkIcon, File02Icon } from '@hugeicons/core-free-icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SocialAccount, SocialMediaItem, SocialPost } from '../socialTypes';
import { formatSocialBody, ProviderMark, PROVIDER_LABELS, postStatusBadgeVariant } from '../crm/socialCrmChrome';
import { formatSocialWhen } from '@/lib/social/socialQueues';
import { cn } from '@/lib/utils';
import { useCachedMediaSource } from '@/lib/hooks/useCachedMediaSource';

export function socialWebUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? value : undefined;
  } catch { return undefined; }
}

function PublicationText({ text }: { text: string }) {
  return <>{formatSocialBody(text).split(/(https?:\/\/[^\s]+|[#@][\p{L}\p{N}_]+)/gu).map((part, index) => {
    const href = socialWebUrl(part);
    if (href) return <a key={index} href={href} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">{part}</a>;
    return /^[#@]/.test(part) ? <span key={index} className="text-primary">{part}</span> : part;
  })}</>;
}

function MediaFrame({ item, compact, fit }: { item: SocialMediaItem; compact: boolean; fit: boolean }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const url = socialWebUrl(item.url);
  const poster = socialWebUrl(item.thumbnailUrl);
  const cachedUrl = useCachedMediaSource(url);
  const cachedPoster = useCachedMediaSource(poster);
  const label = item.alt || item.name || t('social.native.media');
  const mediaClass = cn('mx-auto w-full object-contain', fit ? 'h-full min-h-0' : compact ? 'max-h-80' : 'max-h-[34rem]');
  if (item.type === 'document') return (
    <div className="flex min-h-36 flex-col items-center justify-center gap-3 bg-muted/40 p-5">
      <HugeiconsIcon icon={File02Icon} className="size-8 text-primary" />
      <p className="text-sm font-medium">{item.name || t('social.native.document')}</p>
      {url ? <a className="text-sm text-primary underline" href={url} target="_blank" rel="noreferrer">{t('social.native.open_document')}</a> : <p className="text-xs text-muted-foreground">{t('social.native.media_unavailable')}</p>}
    </div>
  );
  if (failed || (!cachedUrl.source && !cachedPoster.source)) return <div className="flex min-h-36 items-center justify-center bg-muted/40 p-6 text-center text-xs text-muted-foreground">{t('social.native.media_unavailable')}</div>;
  if (item.type === 'video' || item.type === 'reel') return url ? (
    <video src={cachedUrl.source || url} poster={cachedPoster.source || poster} controls playsInline preload="none" aria-label={label} className={mediaClass} onError={() => setFailed(true)}>
      <track kind="captions" srcLang="en" label={label} src="data:text/vtt,WEBVTT" />
    </video>
  ) : <img src={cachedPoster.source || poster} alt={label} loading="lazy" className={mediaClass} onError={() => setFailed(true)} />;
  return <img src={cachedUrl.source || cachedPoster.source || url || poster} alt={label} loading="lazy" referrerPolicy="no-referrer" className={mediaClass} onError={() => setFailed(true)} />;
}

export function SocialPostMedia({ media, compact = false, fit = false }: { media: SocialMediaItem[]; compact?: boolean; fit?: boolean }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const current = Math.min(index, media.length - 1);
  if (!media.length) return null;
  return <div className={cn('overflow-hidden bg-muted/30', fit && 'flex h-full min-h-0 flex-col')}>
    <div className={cn(fit && 'flex min-h-0 flex-1 items-center justify-center overflow-hidden')}>
      <MediaFrame key={`${current}-${media[current].url}`} item={media[current]} compact={compact} fit={fit} />
    </div>
    {media.length > 1 ? <div className="flex shrink-0 items-center justify-between border-t bg-card px-3 py-2">
      <Button size="icon-sm" variant="ghost" aria-label={t('social.native.previous_media')} disabled={current === 0} onClick={() => setIndex(current - 1)}><HugeiconsIcon icon={ArrowLeft01Icon} /></Button>
      <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{current + 1} / {media.length}</span>
      <Button size="icon-sm" variant="ghost" aria-label={t('social.native.next_media')} disabled={current === media.length - 1} onClick={() => setIndex(current + 1)}><HugeiconsIcon icon={ArrowRight01Icon} /></Button>
    </div> : null}
  </div>;
}

export function SocialPostAuthor({ post, account }: { post: SocialPost; account?: SocialAccount }) {
  const { i18n } = useTranslation();
  const author = post.source?.authorName || account?.displayName || account?.handle || PROVIDER_LABELS[post.provider];
  const handle = post.source?.authorHandle || account?.handle;
  return <>
    <Avatar size="lg"><AvatarImage src={socialWebUrl(post.source?.avatarUrl)} alt={author} /><AvatarFallback>{author.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{author}</p><p className="truncate text-xs text-muted-foreground">{[handle && `@${handle.replace(/^@/, '')}`, formatSocialWhen(post.publishedAt ?? post.scheduledAt ?? post.updatedAt, i18n.language)].filter(Boolean).join(' · ')}</p></div>
  </>;
}

export function SocialPostPreview({ post, account, compact = false, detail = false, onInspect }: { post: SocialPost; account?: SocialAccount; compact?: boolean; detail?: boolean; onInspect?: () => void }) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const source = post.source;
  const imageFirst = post.provider === 'instagram';
  const metrics = [
    { key: 'likes', icon: FavouriteIcon }, { key: 'comments', icon: BubbleChatIcon },
    { key: 'shares', icon: Share01Icon }, { key: 'impressions', icon: ViewIcon }, { key: 'saves', icon: Bookmark01Icon },
  ] as const;

  const renderTextBlock = () => (
    <div className="px-5 py-4">
      <p className={cn('whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]', compact && !expanded && 'line-clamp-5')}>
        <PublicationText text={post.body || t('social.hub.no_text')} />
      </p>
      {compact && post.body.length > 220 ? (
        <Button
          variant="link"
          size="sm"
          className="h-auto px-0 pt-2"
          onClick={() => setExpanded(!expanded)}
        >
          {t(expanded ? 'social.native.less' : 'social.native.more')}
        </Button>
      ) : null}
    </div>
  );

  const renderHeader = () => (
    <header className="flex items-center gap-3 px-5 py-4">
      <SocialPostAuthor post={post} account={account} />
      <ProviderMark provider={post.provider} />
    </header>
  );

  const renderQuote = () => {
    if (!source?.quote) return null;
    const quoteUrl = socialWebUrl(source.quote.url);
    return (
      <blockquote className="mx-5 mb-4 rounded-xl border p-4">
        <p className="mb-2 text-xs font-semibold">
          {source.quote.authorName || source.quote.authorHandle}
        </p>
        <p className="whitespace-pre-wrap text-sm">
          <PublicationText text={source.quote.body} />
        </p>
        {quoteUrl ? (
          <a
            href={quoteUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block text-xs text-primary underline"
          >
            {t('social.hub.open_post')}
          </a>
        ) : null}
      </blockquote>
    );
  };

  const renderPoll = () => {
    if (!source?.poll) return null;
    return (
      <div className="mx-5 mb-4 flex flex-col gap-2">
        <p className="text-sm font-semibold">{source.poll.question}</p>
        {source.poll.options.map((option) => (
          <div
            key={option.position}
            className="flex justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm"
          >
            <span>{option.label}</span>
            {option.votes != null ? (
              <span className="tabular-nums text-muted-foreground">
                {t('social.native.votes', { count: option.votes })}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  const renderLinkPreview = () => {
    const linkUrl = socialWebUrl(post.linkUrl);
    if (!linkUrl) return null;
    const linkImage = socialWebUrl(source?.link?.imageUrl);
    return (
      <a
        href={linkUrl}
        target="_blank"
        rel="noreferrer"
        className="mx-5 mb-4 flex flex-col overflow-hidden rounded-xl border transition-colors hover:bg-muted/40"
      >
        {linkImage ? (
          <img
            src={linkImage}
            alt={source?.link?.title || ''}
            loading="lazy"
            className="max-h-48 w-full object-cover"
          />
        ) : null}
        <div className="p-3">
          <p className="text-xs text-muted-foreground">{new URL(post.linkUrl!).hostname}</p>
          <p className="mt-1 text-sm font-medium">{source?.link?.title || post.linkUrl}</p>
          {source?.link?.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {source.link.description}
            </p>
          ) : null}
        </div>
      </a>
    );
  };

  const renderMetrics = () => (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t px-5 py-3">
      {metrics.map(({ key, icon }) =>
        post.metrics?.[key] != null ? (
          <span
            key={key}
            className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground"
            title={t(`social.metrics.${key}`)}
          >
            <HugeiconsIcon icon={icon} className="size-4" />
            <span className="sr-only">{t(`social.metrics.${key}`)}: </span>
            {Intl.NumberFormat(i18n.language, { notation: 'compact' }).format(post.metrics[key]!)}
          </span>
        ) : null
      )}
      {!post.metrics && post.status === 'published' ? (
        <span className="text-xs text-muted-foreground">
          {t('social.native.metrics_unavailable')}
        </span>
      ) : null}
    </div>
  );

  const renderFooter = () => {
    const externalUrl = socialWebUrl(post.externalUrl);
    return (
      <footer className="flex flex-wrap items-center gap-2 bg-muted/25 px-5 py-3">
        <Badge variant={postStatusBadgeVariant(post.status)}>
          {t(`social.studio.status.${post.status}`)}
        </Badge>
        {source?.format ? (
          <Badge variant="outline">
            {t(`social.native.format_${source.format}`, { defaultValue: source.format })}
          </Badge>
        ) : null}
        {post.campaign ? (
          <span className="truncate text-xs text-muted-foreground">{post.campaign}</span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {onInspect ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onInspect}
              aria-label={`${t('social.native.inspect')}: ${formatSocialBody(post.body).slice(0, 80)}`}
            >
              {t('social.native.inspect')}
            </Button>
          ) : null}
          {externalUrl ? (
            <Button
              nativeButton={false}
              variant="ghost"
              size="icon-sm"
              render={
                <a href={externalUrl} target="_blank" rel="noreferrer">
                  <span className="sr-only">{t('social.hub.open_post')}</span>
                </a>
              }
              aria-label={t('social.hub.open_post')}
            >
              <HugeiconsIcon icon={ExternalLinkIcon} />
            </Button>
          ) : null}
        </div>
      </footer>
    );
  };

  return (
    <article
      className={cn(
        'min-w-0 overflow-hidden',
        !detail && 'rounded-2xl border bg-card text-card-foreground',
        !detail && post.provider === 'x' && 'rounded-xl'
      )}
      data-provider={post.provider}
    >
      {!detail ? renderHeader() : null}
      {!imageFirst ? renderTextBlock() : null}
      {!detail ? <SocialPostMedia key={post.id} media={post.media || []} compact={compact} /> : null}
      {imageFirst ? renderTextBlock() : null}
      {renderQuote()}
      {renderPoll()}
      {renderLinkPreview()}
      {!detail ? renderMetrics() : null}
      {!detail ? renderFooter() : null}
    </article>
  );
}
