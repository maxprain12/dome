import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InlineDetailCard, ColorPill } from '@/components/shared/InlineDetailCard';
import { useTranslation } from 'react-i18next';
import type { SocialPost } from '@/components/social/socialTypes';
import { formatSocialWhen } from '@/lib/social/socialQueues';

export function SocialDetailPanel({
  post,
  onClose,
  onEdit,
  onPublish,
  onAskMany,
  busy,
}: {
  post: SocialPost;
  onClose: () => void;
  onEdit: () => void;
  onPublish: () => void;
  onAskMany: () => void;
  busy?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const when = formatSocialWhen(
    post.scheduledAt ?? post.publishedAt ?? post.updatedAt,
    i18n.language,
  );

  return (
    <InlineDetailCard
      onClose={onClose}
      containerName="social-detail"
      title={post.body?.trim() ? post.body.slice(0, 80) : t('social.hub.no_text')}
      description={
        <span className="flex flex-col gap-0.5">
          <span className="capitalize">{post.provider}</span>
          {when ? <span className="text-muted-foreground">{when}</span> : null}
        </span>
      }
      badges={
        <>
          <ColorPill>{t(`social.hub.status_${post.status}`)}</ColorPill>
          {post.campaign ? <Badge variant="outline">{post.campaign}</Badge> : null}
        </>
      }
      footer={
        <div className="flex flex-wrap gap-2">
          {(post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed') && (
            <Button type="button" size="sm" onClick={onEdit}>
              {t('social.hub.edit')}
            </Button>
          )}
          {(post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed') && (
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onPublish}>
              {t('social.hub.publish_now')}
            </Button>
          )}
          <Button type="button" size="sm" variant="secondary" onClick={onAskMany}>
            {t('social.agent_ask_many')}
          </Button>
          {post.externalUrl ? (
            <a
              href={post.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center rounded-lg border border-border bg-background px-2.5 text-sm hover:bg-accent"
            >
              {t('social.hub.open_post')}
            </a>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm whitespace-pre-wrap text-foreground">
        {post.body || t('social.hub.no_text')}
        {post.error ? <p className="text-xs text-destructive">{post.error}</p> : null}
        {post.topics?.length ? (
          <p className="text-xs text-muted-foreground">{post.topics.map((x) => `#${x}`).join(' ')}</p>
        ) : null}
      </div>
    </InlineDetailCard>
  );
}
