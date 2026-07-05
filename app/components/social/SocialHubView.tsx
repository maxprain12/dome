import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Share2, Plus, RefreshCw, Linkedin, Instagram, Twitter, Trash2, Send,
  CalendarClock, Pencil, ExternalLink, Loader2, Settings as SettingsIcon,
  BarChart3, FileText, LayoutDashboard, Sparkles, Building2,
} from 'lucide-react';
import { useTabStore } from '@/lib/store/useTabStore';
import SocialComposerModal from '@/components/social/SocialComposerModal';
import SocialGrowthCards from '@/components/social/SocialGrowthCards';
import SocialReportsSection from '@/components/social/SocialReportsSection';
import type { SocialAccount, SocialGrowthAccount, SocialPost, SocialProvider, SocialSummary } from '@/components/social/socialTypes';

type HubSection = 'dashboard' | 'posts' | 'analytics' | 'reports';

const PROVIDER_ICONS = { linkedin: Linkedin, instagram: Instagram, x: Twitter } as const;
const PROVIDER_LABELS = { linkedin: 'LinkedIn', instagram: 'Instagram', x: 'X' } as const;

const STATUS_COLORS: Record<SocialPost['status'], string> = {
  draft: 'var(--dome-text-muted)',
  scheduled: 'var(--dome-accent)',
  publishing: 'var(--dome-accent)',
  published: 'var(--success)',
  failed: 'var(--dome-error)',
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

  const load = useCallback(async () => {
    const [summaryRes, postsRes, accountsRes, growthRes] = await Promise.all([
      window.electron.invoke('social:summary'),
      window.electron.invoke('social:posts:list', { limit: 200 }),
      window.electron.invoke('social:accounts:list'),
      window.electron.invoke('social:growth', { days: 90 }),
    ]);
    if (summaryRes?.success) setSummary(summaryRes.data);
    if (postsRes?.success) setPosts(postsRes.data);
    if (accountsRes?.success) setAccounts(accountsRes.data);
    if (growthRes?.success) setGrowth(growthRes.data.accounts);
  }, []);

  useEffect(() => {
    void load();
    const unsubs = [
      window.electron?.on?.('social:post-updated', () => void load()),
      window.electron?.on?.('social:account-updated', () => void load()),
      window.electron?.on?.('social:metrics-updated', () => void load()),
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

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {/* Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--dome-border)' }}
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Share2 className="size-5 shrink-0" style={{ color: 'var(--dome-accent)' }} />
          <h1 className="text-base font-semibold truncate" style={{ color: 'var(--dome-text)' }}>
            {t('social.hub.title')}
          </h1>
          <nav className="flex items-center gap-1 ml-4">
            {(
              [
                ['dashboard', LayoutDashboard],
                ['posts', FileText],
                ['analytics', BarChart3],
                ['reports', Sparkles],
              ] as const
            ).map(([id, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                style={{
                  background: section === id ? 'var(--dome-bg-secondary)' : 'transparent',
                  color: section === id ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                  border: section === id ? '1px solid var(--dome-border)' : '1px solid transparent',
                }}
              >
                <Icon className="size-3.5" />
                {t(`social.hub.section_${id}`)}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void refreshMetrics()}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
            style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
            title={t('social.hub.refresh_metrics')}
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {t('social.hub.refresh_metrics')}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingPost(null);
              setComposerOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap"
            style={{ background: 'var(--dome-accent)', color: 'white' }}
          >
            <Plus className="size-3.5" />
            {t('social.hub.new_post')}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-5 py-2 text-xs shrink-0" style={{ color: 'var(--dome-error)' }}>
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4 min-w-0">
        {section === 'dashboard' && (
          <div className="space-y-5 max-w-5xl">
            {/* Connected accounts strip */}
            <div className="flex flex-wrap items-center gap-2">
              {accountStrip.map(({ key, provider: p, account: acc }) => {
                const Icon = acc?.accountKind === 'organization' ? Building2 : PROVIDER_ICONS[p];
                const label = acc
                  ? `${acc.displayName || acc.handle || PROVIDER_LABELS[p]}${acc.status !== 'active' ? ` · ${t(`social.settings.status_${acc.status}`)}` : ''}`
                  : t('social.hub.not_connected', { provider: PROVIDER_LABELS[p] });
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
                    style={{
                      background: 'var(--dome-bg-secondary)',
                      border: '1px solid var(--dome-border)',
                      color: acc ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                      opacity: acc ? 1 : 0.7,
                    }}
                  >
                    <Icon className="size-3.5" style={{ color: acc ? 'var(--dome-accent)' : undefined }} />
                    {label}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={goToSettings}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                style={{ border: '1px dashed var(--dome-border)', color: 'var(--dome-accent)' }}
              >
                <SettingsIcon className="size-3.5" />
                {t('social.hub.manage_accounts')}
              </button>
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
                <div className="space-y-2">
                  {posts
                    .filter((p) => p.status === 'scheduled')
                    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0))
                    .slice(0, 6)
                    .map((post) => (
                      <PostRow
                        key={post.id}
                        post={post}
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
                <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('social.hub.top_posts_empty')}
                </p>
              ) : (
                <MetricsTable posts={summary.topPosts} t={t} />
              )}
            </SectionCard>
          </div>
        )}

        {section === 'posts' && (
          <div className="space-y-3 max-w-5xl">
            <div className="flex items-center gap-1.5 flex-wrap">
              {['all', 'draft', 'scheduled', 'published', 'failed'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{
                    background: statusFilter === s ? 'var(--dome-accent)' : 'var(--dome-bg-secondary)',
                    color: statusFilter === s ? 'white' : 'var(--dome-text-muted)',
                    border: '1px solid var(--dome-border)',
                  }}
                >
                  {t(`social.hub.filter_${s}`)}
                </button>
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
              <div className="space-y-2">
                {filteredPosts.map((post) => (
                  <PostRow
                    key={post.id}
                    post={post}
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
          <div className="space-y-5 max-w-5xl">
            <SectionCard title={t('social.hub.growth_title')}>
              <SocialGrowthCards accounts={growth} />
            </SectionCard>

            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              {(['linkedin', 'instagram', 'x'] as const).map((p) => {
                const agg = summary?.byProvider?.[p];
                const Icon = PROVIDER_ICONS[p];
                return (
                  <div
                    key={p}
                    className="rounded-lg px-4 py-3"
                    style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)' }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="size-4" style={{ color: 'var(--dome-accent)' }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                        {PROVIDER_LABELS[p]}
                      </span>
                    </div>
                    <div className="text-xs space-y-1" style={{ color: 'var(--dome-text-muted)' }}>
                      <div>{t('social.hub.kpi_published')}: <strong style={{ color: 'var(--dome-text)' }}>{agg?.posts ?? 0}</strong></div>
                      <div>{t('social.hub.kpi_impressions')}: <strong style={{ color: 'var(--dome-text)' }}>{agg?.impressions ?? 0}</strong></div>
                      <div>{t('social.hub.kpi_likes')}: <strong style={{ color: 'var(--dome-text)' }}>{agg?.likes ?? 0}</strong></div>
                      <div>{t('social.hub.kpi_comments')}: <strong style={{ color: 'var(--dome-text)' }}>{agg?.comments ?? 0}</strong></div>
                    </div>
                  </div>
                );
              })}
            </div>

            <SectionCard title={t('social.hub.recent_performance')}>
              {!summary || summary.recentPosts.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('social.hub.analytics_empty')}
                </p>
              ) : (
                <MetricsTable posts={summary.recentPosts.filter((p) => p.metrics)} t={t} />
              )}
            </SectionCard>
          </div>
        )}

        {section === 'reports' && <SocialReportsSection />}
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
    <div
      className="rounded-lg px-4 py-3"
      style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)' }}
    >
      <div className="text-xl font-semibold" style={{ color: 'var(--dome-text)' }}>
        {Intl.NumberFormat().format(value || 0)}
      </div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>{label}</div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)' }}
    >
      <div className="text-sm font-medium mb-3" style={{ color: 'var(--dome-text)' }}>{title}</div>
      {children}
    </div>
  );
}

function EmptyHint({ text, actionLabel, onAction }: { text: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{text}</p>
      <button
        type="button"
        onClick={onAction}
        className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium"
        style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-accent)' }}
      >
        <Plus className="size-3.5" />
        {actionLabel}
      </button>
    </div>
  );
}

function PostRow({
  post,
  busy,
  onPublish,
  onEdit,
  onDelete,
}: {
  post: SocialPost;
  busy: boolean;
  onPublish: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const Icon = PROVIDER_ICONS[post.provider];
  const editable = post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed';
  return (
    <div
      className="flex items-start gap-3 rounded-md px-3 py-2.5"
      style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
    >
      <Icon className="size-4 mt-0.5 shrink-0" style={{ color: 'var(--dome-accent)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm line-clamp-2 break-words" style={{ color: 'var(--dome-text)' }}>
          {post.body || <em style={{ color: 'var(--dome-text-muted)' }}>{t('social.hub.no_text')}</em>}
        </p>
        <div className="flex items-center gap-2 mt-1 text-xs flex-wrap" style={{ color: 'var(--dome-text-muted)' }}>
          <span style={{ color: STATUS_COLORS[post.status] }}>{t(`social.hub.status_${post.status}`)}</span>
          {post.scheduledAt && post.status === 'scheduled' && (
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3" />
              {new Date(post.scheduledAt).toLocaleString()}
            </span>
          )}
          {post.publishedAt && <span>{new Date(post.publishedAt).toLocaleString()}</span>}
          {post.campaign && <span>· {post.campaign}</span>}
          {post.topics.length > 0 && <span>· {post.topics.join(', ')}</span>}
          {post.error && <span style={{ color: 'var(--dome-error)' }}>· {post.error}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {post.externalUrl && (
          <a
            href={post.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded-md hover:bg-[var(--dome-bg-hover)]"
            title={t('social.hub.open_post')}
          >
            <ExternalLink className="size-3.5" style={{ color: 'var(--dome-text-muted)' }} />
          </a>
        )}
        {editable && (
          <>
            <button
              type="button"
              onClick={onPublish}
              disabled={busy}
              className="p-1.5 rounded-md hover:bg-[var(--dome-bg-hover)]"
              title={t('social.hub.publish_now')}
            >
              {busy
                ? <Loader2 className="size-3.5 animate-spin" style={{ color: 'var(--dome-accent)' }} />
                : <Send className="size-3.5" style={{ color: 'var(--dome-accent)' }} />}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded-md hover:bg-[var(--dome-bg-hover)]"
              title={t('social.hub.edit')}
            >
              <Pencil className="size-3.5" style={{ color: 'var(--dome-text-muted)' }} />
            </button>
          </>
        )}
        {post.status !== 'publishing' && (
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-md hover:bg-[var(--dome-bg-hover)]"
            title={t('social.hub.delete')}
          >
            <Trash2 className="size-3.5" style={{ color: 'var(--dome-error)' }} />
          </button>
        )}
      </div>
    </div>
  );
}

function MetricsTable({ posts, t }: { posts: SocialPost[]; t: (k: string) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{ color: 'var(--dome-text)' }}>
        <thead>
          <tr style={{ color: 'var(--dome-text-muted)' }}>
            <th className="text-left font-medium py-1.5 pr-3">{t('social.hub.col_post')}</th>
            <th className="text-right font-medium py-1.5 px-2">{t('social.hub.kpi_impressions')}</th>
            <th className="text-right font-medium py-1.5 px-2">{t('social.hub.kpi_likes')}</th>
            <th className="text-right font-medium py-1.5 px-2">{t('social.hub.kpi_comments')}</th>
            <th className="text-right font-medium py-1.5 pl-2">{t('social.hub.col_shares')}</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => {
            const Icon = PROVIDER_ICONS[post.provider];
            return (
              <tr key={post.id} style={{ borderTop: '1px solid var(--dome-border)' }}>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2 min-w-0 max-w-md">
                    <Icon className="size-3.5 shrink-0" style={{ color: 'var(--dome-accent)' }} />
                    <span className="truncate">{post.body || '—'}</span>
                    {post.externalUrl && (
                      <a href={post.externalUrl} target="_blank" rel="noreferrer" className="shrink-0">
                        <ExternalLink className="size-3" style={{ color: 'var(--dome-text-muted)' }} />
                      </a>
                    )}
                  </div>
                </td>
                <td className="text-right py-2 px-2">{post.metrics?.impressions ?? '—'}</td>
                <td className="text-right py-2 px-2">{post.metrics?.likes ?? '—'}</td>
                <td className="text-right py-2 px-2">{post.metrics?.comments ?? '—'}</td>
                <td className="text-right py-2 pl-2">{post.metrics?.shares ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
