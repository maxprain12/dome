import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Calendar03Icon, File01Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DashboardCollection, DashboardRow } from '@/components/shared/dashboard/DashboardCollection';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { socialWebUrl } from './SocialPostPreview';
import { useCachedMediaSource } from '@/lib/hooks/useCachedMediaSource';
import { formatSocialBody, PROVIDER_LABELS } from '@/components/social/crm/socialCrmChrome';
import { compactSocialNumber } from '@/components/social/insights/insightsMetrics';
import { formatSocialWhen, socialPostLabel } from '@/lib/social/socialQueues';
import type { SocialPost } from '@/components/social/socialTypes';

type EditorialStatus = 'scheduled' | 'draft' | 'failed';

export function SocialEditorialQueue({ posts, onOpenPost, onCompose }: { posts: SocialPost[]; onOpenPost: (post: SocialPost) => void; onCompose: () => void }) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<EditorialStatus>('scheduled');
  const queued = posts.filter((post) => post.status === status).sort((a, b) => status === 'scheduled' ? (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0) : b.updatedAt - a.updatedAt);
  return <Card>
    <CardHeader><CardTitle>{t('dashboardPanels.editorial')}</CardTitle><CardDescription>{t('dashboardPanels.editorial_hint')}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-3">
      <ToggleGroup value={[status]} variant="outline" size="sm" aria-label={t('dashboardPanels.editorial')} onValueChange={(values) => { const next = values[0]; if (next === 'scheduled' || next === 'draft' || next === 'failed') setStatus(next); }}>
        {(['scheduled', 'draft', 'failed'] as const).map((value) => <ToggleGroupItem key={value} value={value}>{t(`dashboardPanels.${value}`)}<span className="tabular-nums">{posts.filter((post) => post.status === value).length}</span></ToggleGroupItem>)}
      </ToggleGroup>
      {queued.slice(0, 4).map((post) => <DashboardRow key={post.id} title={formatSocialBody(socialPostLabel(post))} detail={`${PROVIDER_LABELS[post.provider]} · ${formatSocialWhen(post.scheduledAt ?? post.updatedAt, i18n.language)}`} marker={<HugeiconsIcon icon={status === 'scheduled' ? Calendar03Icon : File01Icon} className="size-5" />} onClick={() => onOpenPost(post)} />)}
      {queued.length === 0 && <Empty><EmptyHeader><EmptyTitle>{t('dashboardPanels.queue_empty')}</EmptyTitle></EmptyHeader></Empty>}
      <Button variant="outline" onClick={onCompose}><HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />{t('dashboardPanels.create_post')}</Button>
    </CardContent>
  </Card>;
}

export function SocialRecentPublications({ posts, onOpenPost, onOpenContent }: { posts: SocialPost[]; onOpenPost: (post: SocialPost) => void; onOpenContent: () => void }) {
  const { t, i18n } = useTranslation();
  return <DashboardCollection title={t('social.studio.overview.recent_title')} description={t('dashboardPanels.published_hint')} empty={posts.length === 0} emptyTitle={t('social.studio.overview.recent_empty')} action={<Button size="sm" variant="ghost" onClick={onOpenContent}>{t('dashboardPanels.view_all')}</Button>}>
    <div className="grid gap-3 @min-[760px]/dashboard:grid-cols-2">
      {posts.map((post) => <button key={post.id} type="button" onClick={() => onOpenPost(post)} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-background/60 p-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center justify-between gap-2"><Badge variant="secondary">{PROVIDER_LABELS[post.provider]}</Badge><span className="text-xs text-muted-foreground">{formatSocialWhen(post.publishedAt ?? post.createdAt, i18n.language)}</span></span>
        <PublicationThumbnail post={post} />
        <span className="line-clamp-3 min-h-16 text-sm leading-relaxed">{formatSocialBody(socialPostLabel(post))}</span>
        <span className="mt-auto flex flex-wrap gap-4 border-t border-border pt-3 text-xs text-muted-foreground"><span><strong className="font-medium tabular-nums text-foreground">{compactSocialNumber(post.metrics?.impressions ?? null, i18n.language)}</strong> {t('social.studio.insights.kpi_impressions')}</span><span><strong className="font-medium tabular-nums text-foreground">{compactSocialNumber(post.metrics?.likes ?? null, i18n.language)}</strong> {t('social.studio.overview.mix_likes')}</span></span>
      </button>)}
    </div>
  </DashboardCollection>;
}

function PublicationThumbnail({ post }: { post: SocialPost }) {
  const [failed, setFailed] = useState(false);
  const media = post.media?.[0];
  const url = socialWebUrl(media?.thumbnailUrl || (media?.type === 'image' ? media.url : undefined));
  const { source } = useCachedMediaSource(url);
  if (!source || failed) return null;
  return <img src={source} alt={media?.alt || ''} loading="lazy" referrerPolicy="no-referrer" className="h-32 w-full rounded-md object-cover" onError={() => setFailed(true)} />;
}
