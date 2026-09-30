import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, MoreHorizontalIcon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { HubSearch } from '@/components/hub/HubSearch';
import { SocialEvidenceCard } from '@/components/social/cards/SocialEvidenceCard';
import { socialInitials, usableAvatarSrc } from '@/components/social/cards/SocialAccountAvatar';
import { publicCardToModelSafe } from '@/components/social/cards/socialCardModel';
import { PROVIDER_LABELS } from '@/components/social/crm/socialCrmChrome';
import { socialWebUrl } from '@/components/social/workspace/SocialPostPreview';
import { looksLikeOpaqueId } from '@/lib/social/socialQueues';

type SortKey = 'recent' | 'liked' | 'viewed';
type FormatFilter = 'all' | 'reel' | 'carousel' | 'post';

type CreatorMember = {
  personId: string;
  displayName?: string | null;
  handle?: string | null;
  provider?: string | null;
  profileUrl?: string | null;
  avatarUrl?: string | null;
};

type CreatorPost = {
  id: string;
  title?: string;
  body?: string | null;
  format?: string | null;
  author?: { name?: string; handle?: string | null; avatarUrl?: string | null };
  metrics?: Record<string, number | null> | null;
  publishedAt?: number | null;
  capturedAt?: number | null;
  url?: string | null;
  provider?: string;
  kind?: string;
  media?: Array<{ type?: 'image' | 'video' | 'reel'; url?: string; thumbnailUrl?: string }>;
  limitations?: string[];
  sourceKind?: string;
  topics?: string[];
  followers?: number | null;
  following?: number | null;
  postsCount?: number | null;
};

type CreatorProfile = CreatorPost & {
  body?: string | null;
  followers?: number | null;
};

const SORTS: SortKey[] = ['recent', 'liked', 'viewed'];
const FORMATS: FormatFilter[] = ['all', 'reel', 'carousel', 'post'];

function creatorLabel(
  member: { displayName?: string | null; handle?: string | null },
  fallback: string,
): string {
  const name = member.displayName || (member.handle ? `@${member.handle.replace(/^@/, '')}` : '');
  if (!name || looksLikeOpaqueId(name)) return fallback;
  return name;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function metricValue(item: CreatorPost, key: 'likes' | 'impressions'): number {
  const value = item.metrics?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : -1;
}

export function SocialCreatorProfilePane({
  member,
  listLabel,
  profile,
  posts,
  exploring,
  onExplore,
  onUseInMany,
  onRemove,
  onPlanPost,
  loading = false,
  error = null,
  refreshing = false,
  onRefresh,
  onRetry,
}: {
  loading?: boolean;
  error?: string | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  onRetry?: () => void;
  member: CreatorMember;
  listLabel: string;
  profile: CreatorProfile | null;
  posts: CreatorPost[];
  exploring: boolean;
  onExplore: () => void;
  onUseInMany: () => void;
  onRemove: () => void;
  onPlanPost: (item: CreatorPost) => void;
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [format, setFormat] = useState<FormatFilter>('all');
  const fallback = t('social.creators.unknown_creator');
  const name = creatorLabel(member, fallback);
  const handle = member.handle ? `@${String(member.handle).replace(/^@/, '')}` : null;
  const provider = member.provider
    ? PROVIDER_LABELS[member.provider as keyof typeof PROVIDER_LABELS]
    : null;
  const profileUrl = socialWebUrl(member.profileUrl || profile?.url);
  const bio = String(profile?.body || '').trim();
  const followers = profile?.followers;
  const likes = median(
    posts
      .map((item) => item.metrics?.likes)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
  );
  const views = median(
    posts
      .map((item) => item.metrics?.impressions)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
  );
  const dates = posts.map((item) => item.publishedAt).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const period = dates.length ? {
    from: new Date(Math.min(...dates)).toLocaleDateString(i18n.language),
    to: new Date(Math.max(...dates)).toLocaleDateString(i18n.language),
  } : null;
  const compact = (value: number) =>
    Intl.NumberFormat(i18n.language, { notation: 'compact' }).format(value);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const next = posts.filter((item) => {
      if (format !== 'all' && item.format !== format) return false;
      if (!needle) return true;
      const haystack = [item.title, item.body, item.author?.name, item.author?.handle]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
    next.sort((a, b) => {
      if (sort === 'liked') return metricValue(b, 'likes') - metricValue(a, 'likes');
      if (sort === 'viewed') return metricValue(b, 'impressions') - metricValue(a, 'impressions');
      return (b.publishedAt ?? b.capturedAt ?? 0) - (a.publishedAt ?? a.capturedAt ?? 0);
    });
    return next;
  }, [format, posts, query, sort]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 p-5">
          <section className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-start gap-4">
              <Avatar size="lg" className="size-16">
                <AvatarImage
                  src={usableAvatarSrc(member.avatarUrl || profile?.author?.avatarUrl)}
                  alt={name}
                  referrerPolicy="no-referrer"
                />
                <AvatarFallback className="text-base font-semibold">{socialInitials(name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold tracking-tight">{name}</h2>
                    <p className="truncate text-sm text-muted-foreground">
                      {[handle, provider].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">{t('social.creators.in_list', { list: listLabel })}</Badge>
                    <Button type="button" size="xs" onClick={onExplore} disabled={exploring || loading || refreshing || posts.length === 0}>
                      {exploring ? t('social.creators.exploring') : t('social.creators.explore_now')}
                    </Button>
                    {onRefresh ? <Button type="button" size="sm" variant="outline" onClick={onRefresh} disabled={refreshing || loading || !profileUrl}>
                      {refreshing ? t('social.creators.refreshing_history') : t('social.creators.refresh_history')}
                    </Button> : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button type="button" variant="ghost" size="icon-xs" />}
                        aria-label={t('people.more_actions')}
                      >
                        <HugeiconsIcon icon={MoreHorizontalIcon} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                        {profileUrl ? (
                          <DropdownMenuItem
                            onClick={() => {
                              globalThis.open(profileUrl, '_blank', 'noopener,noreferrer');
                            }}
                          >
                            {t('social.cards.open_profile')}
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem onClick={onUseInMany}>
                          {t('social.creators.use_in_many')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={onRemove}>
                          <HugeiconsIcon icon={Delete02Icon} />
                          {t('common.delete')}
                        </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {bio ? (
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
                    {bio}
                  </p>
                ) : null}
                <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {followers != null ? (
                    <div className="flex items-baseline gap-1.5">
                      <dd className="font-medium tabular-nums">{compact(followers)}</dd>
                      <dt className="text-muted-foreground">{t('social.hub.growth_followers')}</dt>
                    </div>
                  ) : null}
                  <div className="flex items-baseline gap-1.5">
                    <dd className="font-medium tabular-nums">{posts.length}</dd>
                    <dt className="text-muted-foreground">{t('social.creators.posts_cached')}</dt>
                  </div>
                  {(['following', 'postsCount'] as const).map((field) => profile?.[field] != null ? (
                    <div key={field} className="flex items-baseline gap-1.5">
                      <dd className="font-medium tabular-nums">{compact(profile[field])}</dd>
                      <dt className="text-muted-foreground">{t(`social.creators.profile_${field}`)}</dt>
                    </div>
                  ) : null)}
                  {likes != null ? (
                    <div className="flex items-baseline gap-1.5">
                      <dd className="font-medium tabular-nums">{compact(likes)}</dd>
                      <dt className="text-muted-foreground">{t('social.creators.typical_likes')}</dt>
                    </div>
                  ) : null}
                  {views != null ? (
                    <div className="flex items-baseline gap-1.5">
                      <dd className="font-medium tabular-nums">{compact(views)}</dd>
                      <dt className="text-muted-foreground">{t('social.creators.typical_views')}</dt>
                    </div>
                  ) : null}
                </dl>
              </div>
            </div>
          </section>

          <div className="rounded-xl border p-3 text-sm text-muted-foreground" aria-live="polite">
            {loading ? <p>{t('social.creators.loading_history')}</p> : error ? (
              <><p role="alert">{error}</p><Button type="button" variant="outline" size="sm" onClick={onRetry}>{t('common.retry')}</Button></>
            ) : <>
              <p className="font-medium text-foreground">{t('social.creators.history_coverage', { count: posts.length })}</p>
              <p>{period ? t('social.creators.history_period', period) : t('social.creators.history_undated')}</p>
              <p className="mt-1">{t('social.creators.history_partial')}</p>
              {(profile?.limitations || []).filter((code) => ['og_only', 'login_wall', 'requires_browser'].includes(code)).map((code) => (
                <p key={code} className="mt-1">{t(`social.cards.limitation_${code}`)}</p>
              ))}
            </>}
          </div>
          <div className="flex flex-col gap-3">
            <HubSearch
              value={query}
              onChange={setQuery}
              placeholder={t('social.creators.search_posts')}
              aria-label={t('social.creators.search_posts')}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ToggleGroup
                value={[sort]}
                variant="default"
                size="sm"
                aria-label={t('social.creators.sort_recent')}
                onValueChange={(values) => {
                  const next = values[0];
                  if (next === 'recent' || next === 'liked' || next === 'viewed') setSort(next);
                }}
              >
                {SORTS.map((key) => (
                  <ToggleGroupItem key={key} value={key}>
                    {t(`social.creators.sort_${key}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <ToggleGroup
                value={[format]}
                variant="outline"
                size="sm"
                aria-label={t('social.creators.format_all')}
                onValueChange={(values) => {
                  const next = values[0];
                  if (next === 'all' || next === 'reel' || next === 'carousel' || next === 'post') {
                    setFormat(next);
                  }
                }}
              >
                {FORMATS.map((key) => (
                  <ToggleGroupItem key={key} value={key}>
                    {key === 'all'
                      ? t('social.creators.format_all')
                      : t(`social.native.format_${key}`, { defaultValue: key })}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">{loading ? t('social.creators.loading_history') : t(query || format !== 'all' ? 'social.creators.no_matching_posts' : 'social.creators.library_empty')}</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-5">
              {filtered.map((item) => {
                const model = publicCardToModelSafe(item);
                if (!model) return null;
                return (
                  <SocialEvidenceCard
                    key={item.id}
                    model={model}
                    variant="tile"
                    actions={
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        aria-label={t('social.creators.plan_post')}
                        onClick={() => onPlanPost(item)}
                      >
                        <HugeiconsIcon icon={PlusSignIcon} />
                      </Button>
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
