import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SocialAccountAvatar } from '@/components/social/cards/SocialAccountAvatar';
import type { SocialEvidenceCardModel } from '@/components/social/cards/socialCardModel';
import { PROVIDER_LABELS } from '@/components/social/crm/socialCrmChrome';
import { socialWebUrl } from '@/components/social/workspace/SocialPostPreview';
import { cn } from '@/lib/utils';

const LIMITATION_KEYS: Record<SocialEvidenceCardModel['limitations'][number], string> = {
  og_only: 'social.cards.limitation_og_only',
  metrics_unavailable: 'social.native.metrics_unavailable',
  requires_browser: 'social.cards.limitation_requires_browser',
  login_wall: 'social.cards.limitation_login_wall',
  local_only: 'social.cards.limitation_local_only',
};

export function SocialProfileCard({
  model,
  compact = false,
  className,
  actions,
}: {
  model: SocialEvidenceCardModel;
  compact?: boolean;
  className?: string;
  actions?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const handle = model.author.handle ? `@${model.author.handle.replace(/^@/, '')}` : null;
  const profileUrl = socialWebUrl(model.url);
  const followers =
    model.followers != null
      ? Intl.NumberFormat(i18n.language, { notation: 'compact' }).format(model.followers)
      : null;

  return (
    <article
      className={cn(
        'chat-tool-enter min-w-0 overflow-hidden rounded-2xl border bg-card text-card-foreground',
        compact ? 'p-3' : 'p-4',
        className,
      )}
      data-provider={model.provider}
    >
      <header className="flex items-start gap-3">
        <SocialAccountAvatar name={model.author.name} src={model.author.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{model.author.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[handle, PROVIDER_LABELS[model.provider]].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Badge variant="outline">{PROVIDER_LABELS[model.provider]}</Badge>
      </header>
      {model.body ? (
        <p className={cn('mt-3 text-sm text-muted-foreground', compact && 'line-clamp-3')}>
          {model.body}
        </p>
      ) : null}
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        {followers ? (
          <div>
            <dt className="text-xs text-muted-foreground">{t('social.hub.growth_followers')}</dt>
            <dd className="tabular-nums font-medium">{followers}</dd>
          </div>
        ) : null}
        {model.postsCount != null ? (
          <div>
            <dt className="text-xs text-muted-foreground">{t('social.hub.growth_posts')}</dt>
            <dd className="tabular-nums font-medium">{model.postsCount}</dd>
          </div>
        ) : null}
        {model.following != null ? (
          <div>
            <dt className="text-xs text-muted-foreground">{t('social.insights.following')}</dt>
            <dd className="tabular-nums font-medium">
              {Intl.NumberFormat(i18n.language, { notation: 'compact' }).format(model.following)}
            </dd>
          </div>
        ) : null}
      </dl>
      {model.topics && model.topics.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {model.topics.slice(0, 6).map((topic) => (
            <Badge key={topic} variant="secondary">
              {topic}
            </Badge>
          ))}
        </div>
      ) : null}
      {model.limitations.map((limitation) => (
        <p key={limitation} className="mt-2 text-xs text-muted-foreground">
          {t(LIMITATION_KEYS[limitation])}
        </p>
      ))}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {profileUrl ? (
          <Button
            nativeButton={false}
            variant="outline"
            size="xs"
            render={<a href={profileUrl} target="_blank" rel="noreferrer" aria-label={t('social.cards.open_profile')} />}
          >
            {t('social.cards.open_profile')}
          </Button>
        ) : null}
        {actions}
      </div>
    </article>
  );
}
