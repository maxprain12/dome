import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Bookmark01Icon,
  BubbleChatIcon,
  ExternalLinkIcon,
  FavouriteIcon,
  PlayIcon,
  Share01Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SocialAccountAvatar } from '@/components/social/cards/SocialAccountAvatar';
import type { SocialEvidenceCardModel } from '@/components/social/cards/socialCardModel';
import { PROVIDER_LABELS } from '@/components/social/crm/socialCrmChrome';
import { SocialPostMedia, socialWebUrl } from '@/components/social/workspace/SocialPostPreview';
import { formatSocialWhen } from '@/lib/social/socialQueues';
import { cn } from '@/lib/utils';

const LIMITATION_KEYS: Record<SocialEvidenceCardModel['limitations'][number], string> = {
  og_only: 'social.cards.limitation_og_only',
  metrics_unavailable: 'social.native.metrics_unavailable',
  requires_browser: 'social.cards.limitation_requires_browser',
  login_wall: 'social.cards.limitation_login_wall',
  local_only: 'social.cards.limitation_local_only',
};

const METRIC_ICONS = [
  { key: 'likes', icon: FavouriteIcon },
  { key: 'comments', icon: BubbleChatIcon },
  { key: 'shares', icon: Share01Icon },
  { key: 'impressions', icon: ViewIcon },
  { key: 'saves', icon: Bookmark01Icon },
] as const;

function coverSrc(model: SocialEvidenceCardModel): string | null {
  const item = model.media?.[0];
  if (!item) return null;
  const isMotion = item.type === 'video' || item.type === 'reel' || model.format === 'reel';
  const raw = isMotion ? item.thumbnailUrl || item.url : item.url || item.thumbnailUrl;
  return socialWebUrl(raw) ?? null;
}

function SocialEvidenceTile({
  model,
  className,
  actions,
}: {
  model: SocialEvidenceCardModel;
  className?: string;
  actions?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const cover = coverSrc(model);
  const isReel = model.format === 'reel' || model.media?.[0]?.type === 'video' || model.media?.[0]?.type === 'reel';
  const title = String(model.body || model.title || '').trim().split('\n')[0] || t('social.hub.no_text');
  const likes = model.metrics?.likes;
  const views = model.metrics?.impressions;
  const when = model.publishedAt ? formatSocialWhen(model.publishedAt, i18n.language) : null;
  const externalUrl = socialWebUrl(model.url);
  const compact = (value: number) =>
    Intl.NumberFormat(i18n.language, { notation: 'compact' }).format(value);
  const meta = [
    likes != null ? t('social.creators.likes_count', { count: compact(likes) }) : null,
    views != null ? t('social.creators.views_count', { count: compact(views) }) : null,
    when,
  ].filter(Boolean);

  const thumb = (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
      {cover ? (
        <img
          src={cover}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : (
        <p className="line-clamp-4 px-4 py-6 text-sm text-muted-foreground">{title}</p>
      )}
      {isReel ? (
        <span className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-full bg-background/80 text-foreground">
          <HugeiconsIcon icon={PlayIcon} className="size-3.5" />
        </span>
      ) : null}
    </div>
  );

  return (
    <article className={cn('min-w-0', className)} data-provider={model.provider}>
      {externalUrl ? (
        <a href={externalUrl} target="_blank" rel="noreferrer" className="block" aria-label={title}>
          {thumb}
        </a>
      ) : thumb}
      <div className="mt-2 flex gap-2">
        <SocialAccountAvatar name={model.author.name} src={model.author.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{model.author.name}</p>
          {meta.length > 0 ? (
            <p className="truncate text-xs text-muted-foreground">{meta.join(' · ')}</p>
          ) : null}
        </div>
        {actions}
      </div>
    </article>
  );
}

function SocialEvidenceRow({
  model,
  className,
  actions,
}: {
  model: SocialEvidenceCardModel;
  className?: string;
  actions?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const handle = model.author.handle ? `@${model.author.handle.replace(/^@/, '')}` : model.author.name;
  const title = String(model.body || model.title || '').trim().split('\n')[0] || t('social.hub.no_text');
  const cover = coverSrc(model);
  const when = model.publishedAt ? formatSocialWhen(model.publishedAt, i18n.language) : null;
  const externalUrl = socialWebUrl(model.url);
  const compact = (value: number) =>
    Intl.NumberFormat(i18n.language, { notation: 'compact' }).format(value);
  const publicData = model.limitations.includes('og_only') || model.fetchMethod === 'open_graph';
  const meta = [
    model.metrics?.likes != null ? t('social.creators.likes_count', { count: compact(model.metrics.likes) }) : null,
    model.metrics?.comments != null
      ? t('social.creators.comments_count', { count: compact(model.metrics.comments) })
      : null,
    when,
  ].filter(Boolean);

  return (
    <article
      className={cn(
        'flex min-w-0 items-start gap-3 overflow-hidden rounded-2xl border bg-card p-3 text-card-foreground',
        className,
      )}
      data-provider={model.provider}
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
        {cover ? (
          <img
            src={cover}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-full object-cover"
          />
        ) : (
          <SocialAccountAvatar name={model.author.name} src={model.author.avatarUrl} className="size-full rounded-none" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{handle}</p>
          {model.format ? (
            <Badge variant="secondary">
              {t(`social.native.format_${model.format}`, { defaultValue: model.format })}
            </Badge>
          ) : null}
          {publicData ? <Badge variant="outline">{t('chat.visual_public_data')}</Badge> : null}
        </div>
        <p className="mt-0.5 line-clamp-1 text-sm text-foreground">{title}</p>
        {meta.length > 0 ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta.join(' · ')}</p>
        ) : null}
        {externalUrl ? (
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex text-xs font-medium text-foreground underline-offset-2 hover:underline"
          >
            {t('chat.visual_view_post', { network: PROVIDER_LABELS[model.provider] })}
          </a>
        ) : null}
      </div>
      {actions}
    </article>
  );
}

export function SocialEvidenceCard({
  model,
  compact = false,
  variant = 'default',
  className,
  actions,
}: {
  model: SocialEvidenceCardModel;
  compact?: boolean;
  variant?: 'default' | 'tile' | 'row';
  className?: string;
  actions?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const handle = model.author.handle ? `@${model.author.handle.replace(/^@/, '')}` : null;
  const externalUrl = socialWebUrl(model.url);
  const when = model.publishedAt ? formatSocialWhen(model.publishedAt, i18n.language) : null;

  if (variant === 'tile') {
    return <SocialEvidenceTile model={model} className={className} actions={actions} />;
  }
  if (variant === 'row') {
    return <SocialEvidenceRow model={model} className={className} actions={actions} />;
  }

  return (
    <article
      className={cn(
        'chat-tool-enter min-w-0 overflow-hidden rounded-2xl border bg-card text-card-foreground',
        className,
      )}
      data-provider={model.provider}
    >
      <header className="flex items-center gap-3 px-4 py-3">
        <SocialAccountAvatar name={model.author.name} src={model.author.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{model.author.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[handle, when].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Badge variant="outline">{PROVIDER_LABELS[model.provider]}</Badge>
        {model.format ? (
          <Badge variant="secondary">
            {t(`social.native.format_${model.format}`, { defaultValue: model.format })}
          </Badge>
        ) : null}
      </header>
      {model.media && model.media.length > 0 ? (
        <SocialPostMedia media={model.media} compact={compact} />
      ) : null}
      {model.body ? (
        <p className={cn('whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed', compact && 'line-clamp-5')}>
          {model.body}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-2.5">
        {METRIC_ICONS.map(({ key, icon }) => {
          const value = model.metrics?.[key];
          if (value == null) return null;
          return (
            <span key={key} className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
              <HugeiconsIcon icon={icon} className="size-3.5" />
              {Intl.NumberFormat(i18n.language, { notation: 'compact' }).format(value)}
            </span>
          );
        })}
        {model.limitations.map((limitation) => (
          <span key={limitation} className="text-xs text-muted-foreground">
            {t(LIMITATION_KEYS[limitation])}
          </span>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          {actions}
          {externalUrl ? (
            <Button
              nativeButton={false}
              variant="ghost"
              size="icon-xs"
              render={<a href={externalUrl} target="_blank" rel="noreferrer" aria-label={t('social.hub.open_post')} />}
              aria-label={t('social.hub.open_post')}
            >
              <HugeiconsIcon icon={ExternalLinkIcon} />
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
