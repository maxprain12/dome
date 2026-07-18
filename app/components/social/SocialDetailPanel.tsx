import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InlineDetailCard, ColorPill } from '@/components/shared/InlineDetailCard';
import { useTranslation } from 'react-i18next';
import type { SocialMetric, SocialPost } from '@/components/social/socialTypes';
import { SocialPostMetrics } from '@/components/social/SocialPostMetrics';
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
  const [metrics, setMetrics] = useState<SocialMetric | null>(post.metrics ?? null);
  const when = formatSocialWhen(
    post.scheduledAt ?? post.publishedAt ?? post.updatedAt,
    i18n.language,
  );

  useEffect(() => {
    setMetrics(post.metrics ?? null);
    if (post.status !== 'published' || !post.externalPostId) return;
    let cancelled = false;
    void (async () => {
      const listRes = await window.electron.invoke('social:metrics:post', { postId: post.id });
      if (cancelled) return;
      if (listRes?.success && Array.isArray(listRes.data) && listRes.data.length > 0) {
        setMetrics(listRes.data[0] as SocialMetric);
      }
      const fresh = await window.electron.invoke('social:metrics:refreshPost', { postId: post.id });
      if (cancelled) return;
      if (fresh?.success && fresh.data) {
        setMetrics(fresh.data as SocialMetric);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [post.id, post.metrics, post.status, post.externalPostId]);

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
        {metrics ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {t('social.metrics.title')}
            </p>
            <SocialPostMetrics metrics={metrics} />
          </div>
        ) : post.status === 'published' ? (
          <p className="text-xs text-muted-foreground">{t('social.metrics.pending')}</p>
        ) : null}
        {post.error ? <p className="text-xs text-destructive">{post.error}</p> : null}
        {post.topics?.length ? (
          <p className="text-xs text-muted-foreground">{post.topics.map((x) => `#${x}`).join(' ')}</p>
        ) : null}
      </div>
    </InlineDetailCard>
  );
}
