import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Building2Icon, CalendarClockIcon, ChartColumnIcon, CloudIcon, Comment01Icon, DashboardSquare01Icon, Delete02Icon, ExternalLinkIcon, File02Icon, InstagramIcon, Linkedin01Icon, PencilIcon, PlusSignIcon, RefreshIcon, SentIcon, Settings01Icon, SparklesIcon, TwitterIcon } from '@hugeicons/core-free-icons';
import { useTabStore } from '@/lib/store/useTabStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { HubHeader } from '@/components/hub/HubHeader';
import { HubSurface } from '@/components/hub/HubBlocks';
import { cn } from '@/lib/utils';
import SocialComposerModal from '@/components/social/SocialComposerModal';
import SocialGrowthCards from '@/components/social/SocialGrowthCards';
import SocialReportsSection from '@/components/social/SocialReportsSection';
import type { SocialAccount, SocialGrowthAccount, SocialPost, SocialProvider, SocialSummary } from '@/components/social/socialTypes';

type HubSection = 'dashboard' | 'posts' | 'analytics' | 'reports' | 'monitor';

const PROVIDER_ICONS: Record<SocialProvider, IconSvgElement> = { linkedin: Linkedin01Icon, instagram: InstagramIcon, x: TwitterIcon };
const PROVIDER_LABELS = { linkedin: 'LinkedIn', instagram: 'Instagram', x: 'X' } as const;

const STATUS_COLORS: Record<SocialPost['status'], string> = {
  draft: 'var(--muted-foreground)',
  scheduled: 'var(--primary)',
  publishing: 'var(--primary)',
  published: 'var(--success)',
  failed: 'var(--destructive)',
};

export default function SocialHubView() {
  const { t } = useTranslation();
  const { openSettingsTab } = useTabStore();
  const [section, setSection] = useState<HubSection>('dashboard');
  const [summary, setSummary] = useState<SocialSummary | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [growth, setGrowth] = useState<SocialGrowthAccount[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<
    Array<{
      id: string;
      status: string;
      hashtag: string | null;
      commentText: string | null;
      commentAuthor: string | null;
      replyBody: string;
      createdAt: number;
    }>
  >([]);
  const [providerCaps, setProviderCaps] = useState<Record<
    string,
    { listComments?: boolean; sendDm?: boolean }
  > | null>(null);

  const load = useCallback(async () => {
    const [summaryRes, postsRes, accountsRes, growthRes, draftsRes, capsRes] = await Promise.all([
      window.electron.invoke('social:summary'),
      window.electron.invoke('social:posts:list', { limit: 200 }),
      window.electron.invoke('social:accounts:list'),
      window.electron.invoke('social:growth', { days: 90 }),
      window.electron.invoke('social:drafts:list'),
      window.electron.invoke('social:capabilities'),
    ]);
    if (summaryRes?.success) setSummary(summaryRes.data);
    if (postsRes?.success) setPosts(postsRes.data);
    if (accountsRes?.success) setAccounts(accountsRes.data);
    if (growthRes?.success) setGrowth(growthRes.data.accounts);
    if (draftsRes?.success) setReplyDrafts(draftsRes.data?.drafts ?? []);
    if (capsRes?.success) setProviderCaps(capsRes.data?.providers ?? null);
  }, []);

  useEffect(() => {
    void load();
    const unsubs = [
      window.electron?.on?.('social:post-updated', () => void load()),
      window.electron?.on?.('social:posts-refresh', () => void load()),
      window.electron?.on?.('social:account-updated', () => void load()),
      window.electron?.on?.('social:metrics-updated', () => void load()),
      window.electron?.on?.('social:drafts-updated', () => void load()),
    ];
    return () => unsubs.forEach((u) => u?.());
  }, [load]);

  const refreshMetrics = async () => {
    setRefreshing(true);
    setError(null);
    const res = await window.electron.invoke('social:metrics:refresh');
    setRefreshing(false);
    if (!res?.success) setError(res?.error || 'Error');
    await load();
  };

  const publishNow = async (postId: string) => {
    setBusyPostId(postId);
    setError(null);
    const res = await window.electron.invoke('social:posts:publish', { postId });
    setBusyPostId(null);
    if (!res?.success) setError(res?.error || 'Error');
    await load();
  };

  const deletePost = async (postId: string) => {
    await window.electron.invoke('social:posts:delete', { postId });
    await load();
  };

  const filteredPosts = useMemo(
    () => (statusFilter === 'all' ? posts : posts.filter((p) => p.status === statusFilter)),
    [posts, statusFilter],
  );

  const cloudAccountIds = useMemo(
    () => new Set(accounts.filter((a) => a.cloudPublishing).map((a) => a.id)),
    [accounts],
  );

  const isCloudPost = useCallback(
    (post: SocialPost) => Boolean(post.accountId && cloudAccountIds.has(post.accountId)),
    [cloudAccountIds],
  );

  const accountStrip = useMemo(() => {
    const items: Array<{ key: string; provider: SocialProvider; account: SocialAccount | null }> = [];
    for (const p of ['linkedin', 'instagram', 'x'] as const) {
      const provAccounts = accounts.filter((a) => a.provider === p);
      if (p === 'linkedin') {
        if (provAccounts.length === 0) items.push({ key: p, provider: p, account: null });
        else provAccounts.forEach((acc) => items.push({ key: acc.id, provider: p, account: acc }));
      } else {
        items.push({ key: p, provider: p, account: provAccounts[0] ?? null });
      }
    }
    return items;
  }, [accounts]);

  const goToSettings = () => {
    openSettingsTab();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('dome:goto-settings-section', { detail: 'social' }));
    }, 100);
  };

  const counts = summary?.counts ?? { draft: 0, scheduled: 0, publishing: 0, published: 0, failed: 0 };
  const totals = summary?.totals ?? { impressions: 0, likes: 0, comments: 0, shares: 0, saves: 0 };

  const lastSyncAt = useMemo(() => {
    let max: number | null = null;
    for (const a of accounts) {
      if (a.lastSyncAt != null && (max == null || a.lastSyncAt > max)) max = a.lastSyncAt;
    }
    return max;
  }, [accounts]);

  const syncDescription = error
    ? t('social.hub.sync_error', { error })
    : refreshing
      ? t('social.hub.syncing')
      : lastSyncAt
        ? t('social.hub.last_sync', {
            time: new Date(lastSyncAt).toLocaleString([], {
              hour: '2-digit',
              minute: '2-digit',
              day: 'numeric',
              month: 'short',
            }),
          })
        : t('social.hub.sync_idle');

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="shrink-0 space-y-3 border-b px-4 py-3">
        <HubHeader
          title={t('social.hub.title')}
          description={syncDescription}
          actions={
            <>
              {error ? (
                <Badge variant="destructive">{t('social.hub.sync_badge_error')}</Badge>
              ) : refreshing ? (
                <Badge variant="secondary">{t('social.hub.sync_badge_syncing')}</Badge>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void refreshMetrics()}
                disabled={refreshing}
                title={t('social.hub.refresh_metrics')}
              >
                {refreshing ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
                )}
                {t('social.hub.refresh_metrics')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditingPost(null);
                  setComposerOpen(true);
                }}
              >
                <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
                {t('social.hub.new_post')}
              </Button>
            </>
          }
        />
        <Tabs value={section} onValueChange={(v) => setSection(v as HubSection)}>
          <TabsList className="h-auto w-full max-w-full flex-wrap">
            {(
              [
                ['dashboard', DashboardSquare01Icon],
                ['posts', File02Icon],
                ['analytics', ChartColumnIcon],
                ['reports', SparklesIcon],
                ['monitor', Comment01Icon],
              ] as const
            ).map(([id, icon]) => (
              <TabsTrigger key={id} value={id} className="gap-1.5 px-2.5 text-xs">
                <HugeiconsIcon icon={icon} className="size-3.5" />
                {t(`social.hub.section_${id}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
        {section === 'dashboard' && (
          <div className="flex flex-col gap-5 max-w-5xl">
            {/* Connected accounts strip */}
            <div className="flex flex-wrap items-center gap-2">
              {accountStrip.map(({ key, provider: p, account: acc }) => {
                const icon = acc?.accountKind === 'organization' ? Building2Icon : PROVIDER_ICONS[p];
                const label = acc
                  ? `${acc.displayName || acc.handle || PROVIDER_LABELS[p]}${acc.status !== 'active' ? ` · ${t(`social.settings.status_${acc.status}`)}` : ''}`
                  : t('social.hub.not_connected', { provider: PROVIDER_LABELS[p] });
                return (
                  <Badge
                    key={key}
                    variant="outline"
                    className={cn('gap-2 bg-card px-3 py-1.5 font-normal', !acc && 'text-muted-foreground opacity-70')}
                  >
                    <HugeiconsIcon icon={icon} className={cn('size-3.5', acc && 'text-primary')} />
                    {label}
                  </Badge>
                );
              })}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full border-dashed text-xs text-primary"
                onClick={goToSettings}
              >
                <HugeiconsIcon icon={Settings01Icon} className="size-3.5" />
                {t('social.hub.manage_accounts')}
              </Button>
            </div>

            {/* KPI cards */}
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              <KpiCard label={t('social.hub.kpi_published')} value={counts.published} />
              <KpiCard label={t('social.hub.kpi_scheduled')} value={counts.scheduled} />
              <KpiCard label={t('social.hub.kpi_drafts')} value={counts.draft} />
              <KpiCard label={t('social.hub.kpi_impressions')} value={totals.impressions} />
              <KpiCard label={t('social.hub.kpi_likes')} value={totals.likes} />
              <KpiCard label={t('social.hub.kpi_comments')} value={totals.comments} />
            </div>

            {/* Upcoming scheduled */}
            <SectionCard title={t('social.hub.upcoming')}>
              {posts.filter((p) => p.status === 'scheduled').length === 0 ? (
                <EmptyHint
                  text={t('social.hub.upcoming_empty')}
                  actionLabel={t('social.hub.new_post')}
                  onAction={() => {
                    setEditingPost(null);
                    setComposerOpen(true);
                  }}
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {posts
                    .filter((p) => p.status === 'scheduled')
                    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0))
                    .slice(0, 6)
                    .map((post) => (
                      <PostRow
                        key={post.id}
                        post={post}
                        isCloud={isCloudPost(post)}
                        busy={busyPostId === post.id}
                        onPublish={() => void publishNow(post.id)}
                        onEdit={() => {
                          setEditingPost(post);
                          setComposerOpen(true);
                        }}
                        onDelete={() => void deletePost(post.id)}
                      />
                    ))}
                </div>
              )}
            </SectionCard>

            {/* Top posts */}
            <SectionCard title={t('social.hub.top_posts')}>
              {!summary || summary.topPosts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('social.hub.top_posts_empty')}
                </p>
              ) : (
                <MetricsTable posts={summary.topPosts} t={t} />
              )}
            </SectionCard>
          </div>
        )}

        {section === 'posts' && (
          <div className="flex flex-col gap-3 max-w-5xl">
            <div className="flex items-center gap-1.5 flex-wrap">
              {['all', 'draft', 'scheduled', 'published', 'failed'].map((s) => (
                <Button
                  key={s}
                  type="button"
                  size="xs"
                  variant={statusFilter === s ? 'default' : 'outline'}
                  className="rounded-full text-xs"
                  onClick={() => setStatusFilter(s)}
                >
                  {t(`social.hub.filter_${s}`)}
                </Button>
              ))}
            </div>
            {filteredPosts.length === 0 ? (
              <EmptyHint
                text={t('social.hub.posts_empty')}
                actionLabel={t('social.hub.new_post')}
                onAction={() => {
                  setEditingPost(null);
                  setComposerOpen(true);
                }}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {filteredPosts.map((post) => (
                  <PostRow
                    key={post.id}
                    post={post}
                    isCloud={isCloudPost(post)}
                    busy={busyPostId === post.id}
                    onPublish={() => void publishNow(post.id)}
                    onEdit={() => {
                      setEditingPost(post);
                      setComposerOpen(true);
                    }}
                    onDelete={() => void deletePost(post.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {section === 'analytics' && (
          <div className="flex flex-col gap-5 max-w-5xl">
            <SectionCard title={t('social.hub.growth_title')}>
              <SocialGrowthCards accounts={growth} />
            </SectionCard>

            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              {(['linkedin', 'instagram', 'x'] as const).map((p) => {
                const agg = summary?.byProvider?.[p];
                const icon = PROVIDER_ICONS[p];
                return (
                  <Card key={p} size="sm" className="gap-0 rounded-xl px-4 py-3 shadow-none">
                    <CardContent className="p-0">
                    <div className="flex items-center gap-2 mb-2">
                      <HugeiconsIcon icon={icon} className="size-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">
                        {PROVIDER_LABELS[p]}
                      </span>
                    </div>
                    <div className="text-xs flex flex-col gap-1 text-muted-foreground">
                      <div>{t('social.hub.kpi_published')}: <strong className="text-foreground">{agg?.posts ?? 0}</strong></div>
                      <div>{t('social.hub.kpi_impressions')}: <strong className="text-foreground">{agg?.impressions ?? 0}</strong></div>
                      <div>{t('social.hub.kpi_likes')}: <strong className="text-foreground">{agg?.likes ?? 0}</strong></div>
                      <div>{t('social.hub.kpi_comments')}: <strong className="text-foreground">{agg?.comments ?? 0}</strong></div>
                    </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <SectionCard title={t('social.hub.recent_performance')}>
              {!summary || summary.recentPosts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('social.hub.analytics_empty')}
                </p>
              ) : (
                <MetricsTable posts={summary.recentPosts.filter((p) => p.metrics)} t={t} />
              )}
            </SectionCard>
          </div>
        )}

        {section === 'reports' && <SocialReportsSection />}

        {section === 'monitor' && (
          <div className="flex max-w-2xl flex-col gap-5">
            <HubSurface
              icon={Comment01Icon}
              title={t('social.hub.monitor_title')}
              description={t('social.hub.monitor_description')}
            >
              <p className="text-sm text-muted-foreground">{t('social.hub.monitor_empty')}</p>
            </HubSurface>

            {providerCaps ? (
              <section className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('social.hub.monitor_capabilities')}
                </h2>
                <div className="flex flex-col gap-2">
                  {(['linkedin', 'instagram', 'x'] as const).map((p) => {
                    const caps = providerCaps[p];
                    return (
                      <div
                        key={p}
                        className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs"
                      >
                        <HugeiconsIcon icon={PROVIDER_ICONS[p]} className="size-3.5 text-primary" />
                        <span className="font-medium">{PROVIDER_LABELS[p]}</span>
                        <Badge variant="outline">
                          {caps?.listComments
                            ? t('social.hub.cap_comments_yes')
                            : t('social.hub.cap_comments_no')}
                        </Badge>
                        <Badge variant="outline">
                          {caps?.sendDm ? t('social.hub.cap_dm_yes') : t('social.hub.cap_dm_no')}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('social.hub.monitor_drafts')}
                </h2>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    void window.electron.invoke('social:drafts:poll-now').then(() => load());
                  }}
                >
                  {t('social.hub.poll_comments')}
                </Button>
              </div>
              {replyDrafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('social.hub.monitor_drafts_empty')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {replyDrafts.map((draft) => (
                    <div
                      key={draft.id}
                      className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <Badge
                            variant={
                              draft.status === 'sent'
                                ? 'default'
                                : draft.status === 'failed'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                            className="mb-1"
                          >
                            {draft.status === 'sent'
                              ? t('social.hub.draft_sent_badge')
                              : draft.status === 'failed'
                                ? t('social.hub.draft_failed_badge')
                                : t('social.hub.draft_only_badge')}
                          </Badge>
                          {draft.hashtag ? (
                            <p className="text-xs text-muted-foreground">#{draft.hashtag}</p>
                          ) : null}
                          {draft.commentText ? (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                              {draft.commentAuthor ? `${draft.commentAuthor}: ` : ''}
                              {draft.commentText}
                            </p>
                          ) : null}
                          <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">
                            {draft.replyBody}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1">
                          {draft.status !== 'sent' ? (
                            <Button
                              type="button"
                              size="xs"
                              onClick={() => {
                                void window.electron
                                  .invoke('social:drafts:send', { draftId: draft.id })
                                  .then(() => load())
                                  .catch(() => load());
                              }}
                            >
                              {t('social.hub.send_dm')}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            onClick={() => {
                              void window.electron
                                .invoke('social:drafts:dismiss', { draftId: draft.id })
                                .then(() => load());
                            }}
                          >
                            {t('social.hub.dismiss_draft')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {composerOpen && (
        <SocialComposerModal
          accounts={accounts}
          editingPost={editingPost}
          onClose={() => {
            setComposerOpen(false);
            setEditingPost(null);
          }}
          onSaved={() => {
            setComposerOpen(false);
            setEditingPost(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm" className="gap-0.5 rounded-xl px-4 py-3 shadow-none">
      <CardContent className="p-0">
      <div className="text-xl font-semibold text-foreground">
        {Intl.NumberFormat().format(value || 0)}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card size="sm" className="gap-0 rounded-xl px-4 py-3 shadow-none">
      <CardHeader className="p-0 pb-3">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

function EmptyHint({ text, actionLabel, onAction }: { text: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-xs text-muted-foreground">{text}</p>
      <Button type="button" size="sm" variant="outline" className="text-xs text-primary" onClick={onAction}>
        <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
        {actionLabel}
      </Button>
    </div>
  );
}

function PostRow({
  post,
  isCloud,
  busy,
  onPublish,
  onEdit,
  onDelete,
}: {
  post: SocialPost;
  isCloud?: boolean;
  busy: boolean;
  onPublish: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const icon = PROVIDER_ICONS[post.provider];
  const editable = post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed';
  return (
    <div className="flex items-start gap-3 rounded-md border bg-background px-3 py-2.5">
      <HugeiconsIcon icon={icon} className="size-4 mt-0.5 shrink-0 text-primary" />
      <div className="flex-1 min-w-0">
        <p className="text-sm line-clamp-2 break-words text-foreground">
          {post.body || <em className="text-muted-foreground">{t('social.hub.no_text')}</em>}
        </p>
        <div className="flex items-center gap-2 mt-1 text-xs flex-wrap text-muted-foreground">
          <span style={{ color: STATUS_COLORS[post.status] }}>{t(`social.hub.status_${post.status}`)}</span>
          {isCloud && post.status === 'scheduled' && (
            <span className="inline-flex items-center gap-0.5" title={t('social.hub.cloud_scheduled')}>
              <HugeiconsIcon icon={CloudIcon} className="size-3 text-primary" />
            </span>
          )}
          {post.scheduledAt && post.status === 'scheduled' && (
            <span className="flex items-center gap-1">
              <HugeiconsIcon icon={CalendarClockIcon} className="size-3" />
              {new Date(post.scheduledAt).toLocaleString()}
            </span>
          )}
          {post.publishedAt && <span>{new Date(post.publishedAt).toLocaleString()}</span>}
          {post.campaign && <span>· {post.campaign}</span>}
          {post.topics.length > 0 && <span>· {post.topics.join(', ')}</span>}
          {post.error && <span className="text-destructive">· {post.error}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {post.externalUrl && (
          <a
            href={post.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded-md hover:bg-accent"
            title={t('social.hub.open_post')}
          >
            <HugeiconsIcon icon={ExternalLinkIcon} className="size-3.5 text-muted-foreground" />
          </a>
        )}
        {editable && (
          <>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={onPublish}
              disabled={busy}
              title={t('social.hub.publish_now')}
              aria-label={t('social.hub.publish_now')}
            >
              {busy ? <Spinner className="size-3.5 text-primary" /> : <HugeiconsIcon icon={SentIcon} className="size-3.5 text-primary" />}
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={onEdit}
              title={t('social.hub.edit')}
              aria-label={t('social.hub.edit')}
            >
              <HugeiconsIcon icon={PencilIcon} className="size-3.5 text-muted-foreground" />
            </Button>
          </>
        )}
        {post.status !== 'publishing' && (
          <AlertDialog>
            <AlertDialogTrigger render={<Button type="button" size="icon-xs" variant="ghost" />}>
              <HugeiconsIcon icon={Delete02Icon} className="text-destructive" />
              <span className="sr-only">{t('social.hub.delete')}</span>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>{t('social.hub.delete')}</AlertDialogTitle>
                <AlertDialogDescription>{t('social.hub.no_text')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onDelete}>
                  {t('social.hub.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

function MetricsTable({ posts, t }: { posts: SocialPost[]; t: (k: string) => string }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('social.hub.col_post')}</TableHead>
            <TableHead className="text-right">{t('social.hub.kpi_impressions')}</TableHead>
            <TableHead className="text-right">{t('social.hub.kpi_likes')}</TableHead>
            <TableHead className="text-right">{t('social.hub.kpi_comments')}</TableHead>
            <TableHead className="text-right">{t('social.hub.col_shares')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.map((post) => {
            const icon = PROVIDER_ICONS[post.provider];
            return (
              <TableRow key={post.id}>
                <TableCell>
                  <div className="flex items-center gap-2 min-w-0 max-w-md">
                    <HugeiconsIcon icon={icon} className="size-3.5 shrink-0 text-primary" />
                    <span className="truncate">{post.body || '—'}</span>
                    {post.externalUrl && (
                      <a href={post.externalUrl} target="_blank" rel="noreferrer" className="shrink-0">
                        <HugeiconsIcon icon={ExternalLinkIcon} className="size-3 text-muted-foreground" />
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">{post.metrics?.impressions ?? '—'}</TableCell>
                <TableCell className="text-right">{post.metrics?.likes ?? '—'}</TableCell>
                <TableCell className="text-right">{post.metrics?.comments ?? '—'}</TableCell>
                <TableCell className="text-right">{post.metrics?.shares ?? '—'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
