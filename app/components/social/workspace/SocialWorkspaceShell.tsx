import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  BarChartIcon,
  Calendar03Icon,
  DashboardSquare01Icon,
  Edit02Icon,
  ExternalLinkIcon,
  File02Icon,
  Megaphone02Icon,
  PlusSignIcon,
  RefreshIcon,
  Search01Icon,
  SentIcon,
  SparklesIcon,
  UserMultiple02Icon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { SocialAccountsManager } from '@/components/social/accounts/SocialAccountsManager';
import { SocialComposerWorkspace } from '@/components/social/composer/SocialComposerWorkspace';
import { SocialEventEditor, SocialEventsStudio } from '@/components/social/events/SocialEventsStudio';
import { SocialInsightsStudio } from '@/components/social/insights/SocialInsightsStudio';
import type {
  SocialAccount,
  SocialCampaign,
  SocialComment,
  SocialGrowthAccount,
  SocialMetric,
  SocialPost,
  SocialReport,
} from '@/components/social/socialTypes';
import { toast } from 'sonner';
import {
  buildSocialQueues,
  computeSocialStats,
  filterPostsByAccount,
  filterPostsByQuery,
  formatSocialWhen,
  socialAccountLabel,
  socialPostLabel,
  type SocialReplyDraft,
} from '@/lib/social/socialQueues';
import { useManyStore } from '@/lib/store/useManyStore';
import { cn } from '@/lib/utils';
import type {
  SocialContentFilter,
  SocialEditor,
  SocialSection,
  SocialSelection,
} from './socialWorkspaceTypes';
import { useSocialWorkspace } from './useSocialWorkspace';

interface NavItem {
  id: SocialSection;
  icon: IconSvgElement;
  labelKey: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', icon: DashboardSquare01Icon, labelKey: 'social.studio.nav.overview' },
  { id: 'content', icon: File02Icon, labelKey: 'social.studio.nav.content' },
  { id: 'campaigns', icon: Megaphone02Icon, labelKey: 'social.studio.nav.campaigns' },
  { id: 'events', icon: Calendar03Icon, labelKey: 'social.studio.nav.events' },
  { id: 'insights', icon: BarChartIcon, labelKey: 'social.studio.nav.insights' },
  { id: 'accounts', icon: UserMultiple02Icon, labelKey: 'social.studio.nav.accounts' },
];

const SECTION_TITLES: Record<SocialSection, string> = {
  overview: 'social.studio.nav.overview',
  content: 'social.studio.nav.content',
  campaigns: 'social.studio.nav.campaigns',
  events: 'social.studio.nav.events',
  insights: 'social.studio.nav.insights',
  accounts: 'social.studio.nav.accounts',
};

const PROVIDER_LABELS: Record<SocialPost['provider'], string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  x: 'X',
};

export function SocialWorkspaceShell() {
  const workspace = useSocialWorkspace();
  const [section, setSection] = useState<SocialSection>('overview');
  const [selection, setSelection] = useState<SocialSelection>({ kind: 'none' });
  const [editor, setEditor] = useState<SocialEditor>({ kind: 'none' });
  const [query, setQuery] = useState('');
  const [accountId, setAccountId] = useState<string>('all');
  const [contentFilter, setContentFilter] = useState<SocialContentFilter>('all');
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);

  const navigate = (next: SocialSection) => {
    setSection(next);
    setSelection({ kind: 'none' });
  };

  const selectedAccountId = accountId === 'all' ? null : accountId;
  const filteredPosts = useMemo(() => {
    const byAccount = filterPostsByAccount(workspace.posts, selectedAccountId);
    const byQuery = filterPostsByQuery(byAccount, query);
    return contentFilter === 'all' ? byQuery : byQuery.filter((post) => post.status === contentFilter);
  }, [contentFilter, query, selectedAccountId, workspace.posts]);

  if (editor.kind === 'post') {
    return (
      <SocialComposerWorkspace
        accounts={workspace.accounts}
        campaigns={workspace.campaigns}
        post={editor.post}
        initialCampaignId={editor.campaignId}
        onClose={() => setEditor({ kind: 'none' })}
        onSaved={() => {
          setEditor({ kind: 'none' }); workspace.load();
        }}
      />
    );
  }

  if (editor.kind === 'event') {
    return (
      <SocialEventEditor
        card={editor.card}
        onClose={() => setEditor({ kind: 'none' })}
        onSaved={() => setEditor({ kind: 'none' })}
      />
    );
  }

  return (
    <div className="social-studio @container/social-studio flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
        <WorkspaceHeader
          section={section}
          onNavigate={navigate}
          accounts={workspace.accounts}
          accountId={accountId}
          onAccountId={setAccountId}
          query={query}
          onQuery={setQuery}
          refreshing={workspace.refreshing}
          error={workspace.error}
          lastSyncAt={workspace.lastSyncAt}
          onSync={() => workspace.syncFeed(selectedAccountId)}
          onCompose={() => setEditor({ kind: 'post', post: null })}
        />

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <main className="min-w-0 flex-1 overflow-auto">
            {workspace.loading ? (
              <WorkspaceSkeleton />
            ) : section === 'overview' ? (
              <OverviewView
                posts={filteredPosts}
                accounts={workspace.accounts}
                campaigns={workspace.campaigns}
                growth={workspace.growth}
                replyDrafts={workspace.replyDrafts}
                onNavigate={navigate}
                onSelect={setSelection}
                onCompose={() => setEditor({ kind: 'post', post: null })}
                onPoll={() => workspace.pollComments()}
              />
            ) : section === 'content' ? (
              <ContentView
                posts={filteredPosts}
                filter={contentFilter}
                onFilter={setContentFilter}
                selectedId={selection.kind === 'post' ? selection.post.id : null}
                onSelect={(post) => setSelection({ kind: 'post', post })}
                onCompose={() => setEditor({ kind: 'post', post: null })}
              />
            ) : section === 'campaigns' ? (
              <CampaignsView
                campaigns={workspace.campaigns}
                posts={workspace.posts}
                selectedId={selection.kind === 'campaign' ? selection.campaign.id : null}
                onSelect={(campaign) => setSelection({ kind: 'campaign', campaign })}
                onCreate={() => setCampaignDialogOpen(true)}
              />
            ) : section === 'events' ? (
              <SocialEventsStudio accounts={workspace.accounts} posts={workspace.posts} onEdit={(card) => setEditor({ kind: 'event', card })} />
            ) : section === 'insights' ? (
              <SocialInsightsStudio
                growth={workspace.growth}
                posts={filteredPosts}
                onSelectReport={(report) => setSelection({ kind: 'report', report })}
                onOpenEvents={() => navigate('events')}
                onOpenAccounts={() => navigate('accounts')}
              />
            ) : (
              <SocialAccountsManager embedded />
            )}
          </main>

          {selection.kind !== 'none' && selection.kind !== 'event' ? (
            <DetailDialog
              selection={selection}
              onClose={() => setSelection({ kind: 'none' })}
              onEditPost={(post) => setEditor({ kind: 'post', post })}
              onPublish={(post) => workspace.publishPost(post.id)}
              onComposeCampaign={(campaign) => setEditor({ kind: 'post', post: null, campaignId: campaign.id, campaignName: campaign.name })}
              onPostUpdated={(post) => {
                setSelection({ kind: 'post', post }); workspace.load();
              }}
            />
          ) : null}
        </div>

      <CampaignDialog
        open={campaignDialogOpen}
        onOpenChange={setCampaignDialogOpen}
        onCreated={async (campaign) => {
          await workspace.load();
          setSelection({ kind: 'campaign', campaign });
        }}
      />
    </div>
  );
}

function WorkspaceHeader({ section, onNavigate, accounts, accountId, onAccountId, query, onQuery, refreshing, error, lastSyncAt, onSync, onCompose }: { section: SocialSection; onNavigate: (section: SocialSection) => void; accounts: SocialAccount[]; accountId: string; onAccountId: (value: string) => void; query: string; onQuery: (value: string) => void; refreshing: boolean; error: string | null; lastSyncAt: number | null; onSync: () => void; onCompose: () => void }) {
  const { t } = useTranslation();
  const searchable = section === 'overview' || section === 'content' || section === 'campaigns';
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const activeAccounts = accounts.filter((account) => account.status === 'active').length;
  return <header className="shrink-0 border-b bg-background/95"><div className="flex flex-wrap items-center gap-3 px-3 py-3 @[48rem]/social-studio:px-5"><div className="mr-auto min-w-32"><p className="text-xs text-muted-foreground">{t('social.hub.title')}</p><h1 className="font-heading text-lg font-semibold tracking-tight">{t(SECTION_TITLES[section])}</h1></div>{searchable ? <div className="relative order-last w-full @[48rem]/social-studio:order-none @[48rem]/social-studio:w-64"><HugeiconsIcon icon={Search01Icon} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder={t('social.agent_search')} className="pl-8" /></div> : null}<Select value={accountId} onValueChange={(value) => onAccountId(value ?? 'all')}><SelectTrigger className="max-w-48"><SelectValue>{accountId === 'all' ? t('social.agent_filter_all') : selectedAccount ? socialAccountLabel(selectedAccount) : t('social.agent_filter_all')}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">{t('social.agent_filter_all')}</SelectItem>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{socialAccountLabel(account)}</SelectItem>)}</SelectGroup></SelectContent></Select><Button type="button" variant="outline" size="icon-sm" onClick={onSync} disabled={refreshing} aria-label={t('social.hub.sync_feed')} title={lastSyncAt ? new Date(lastSyncAt).toLocaleString() : t('social.hub.sync_feed')}>{refreshing ? <Spinner /> : <HugeiconsIcon icon={RefreshIcon} />}</Button><Button type="button" onClick={onCompose} aria-label={t('social.hub.new_post')}><HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" /><span className="hidden @[48rem]/social-studio:inline">{t('social.hub.new_post')}</span></Button>{error ? <Badge variant="destructive">{t('social.hub.sync_badge_error')}</Badge> : null}</div><div className="overflow-x-auto px-3 @[48rem]/social-studio:px-5"><Tabs value={section} onValueChange={(value) => onNavigate(value as SocialSection)}><TabsList variant="line" aria-label={t('social.studio.header.sections')} className="h-10 min-w-max gap-2">{NAV_ITEMS.map((item) => <TabsTrigger key={item.id} value={item.id} className="px-2.5"><HugeiconsIcon icon={item.icon} data-icon="inline-start" />{t(item.labelKey)}{item.id === 'accounts' && activeAccounts > 0 ? <Badge variant="outline">{activeAccounts}</Badge> : null}</TabsTrigger>)}</TabsList></Tabs></div></header>;
}

function OverviewView({ posts, accounts, campaigns, growth, replyDrafts, onNavigate, onSelect, onCompose, onPoll }: { posts: SocialPost[]; accounts: SocialAccount[]; campaigns: SocialCampaign[]; growth: SocialGrowthAccount[]; replyDrafts: SocialReplyDraft[]; onNavigate: (section: SocialSection) => void; onSelect: (selection: SocialSelection) => void; onCompose: () => void; onPoll: () => void }) {
  const { t } = useTranslation();
  const queues = buildSocialQueues(posts, replyDrafts);
  const stats = computeSocialStats(posts, replyDrafts, accounts.filter((account) => account.status === 'active').length, growth);
  const upcoming = queues.scheduledSoon.slice(0, 4);
  const attention = queues.needsAttention.slice(0, 4);
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === 'active').slice(0, 4);
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 lg:p-6"><Card variant="brand" className="social-studio-hero"><CardHeader><p className="text-xs font-medium uppercase tracking-[0.18em] text-primary-foreground/70">{t('social.studio.overview.eyebrow')}</p><CardTitle className="max-w-2xl text-2xl @[48rem]/social-studio:text-3xl">{stats.attention ? t('social.studio.overview.attention_title', { count: stats.attention }) : t('social.studio.overview.clear_title')}</CardTitle><CardDescription className="max-w-xl">{t('social.studio.overview.description')}</CardDescription></CardHeader><CardFooter className="gap-2"><Button type="button" variant="secondary" onClick={onCompose}><HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />{t('social.hub.new_post')}</Button><Button type="button" variant="ghost" onClick={() => onNavigate('insights')} className="text-primary-foreground">{t('social.studio.overview.view_insights')}</Button></CardFooter></Card><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label={t('social.agent_stat_drafts')} value={stats.drafts} hint={t('social.studio.overview.in_workspace')} /><MetricCard label={t('social.agent_stat_scheduled')} value={stats.scheduled} hint={t('social.studio.overview.next_queue')} /><MetricCard label={t('social.agent_stat_attention')} value={stats.attention} hint={t('social.studio.overview.needs_review')} /><MetricCard label={t('social.agent_stat_campaigns')} value={activeCampaigns.length} hint={t('social.studio.overview.active_now')} /></div><div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]"><div className="flex flex-col gap-5"><OverviewList title={t('social.agent_queue_attention')} description={t('social.studio.overview.attention_description')} posts={attention} empty={t('social.agent_queue_attention_empty')} onSelect={(post) => onSelect({ kind: 'post', post })} action={<Button type="button" variant="outline" size="sm" onClick={onPoll}>{t('social.hub.poll_comments')}</Button>} /><OverviewList title={t('social.agent_queue_scheduled')} description={t('social.studio.overview.schedule_description')} posts={upcoming} empty={t('social.hub.upcoming_empty')} onSelect={(post) => onSelect({ kind: 'post', post })} action={<Button type="button" variant="ghost" size="sm" onClick={() => onNavigate('content')}>{t('social.studio.overview.view_all')}</Button>} /></div><Card><CardHeader><CardTitle>{t('social.studio.overview.campaigns_title')}</CardTitle><CardDescription>{t('social.studio.overview.campaigns_description')}</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{activeCampaigns.map((campaign) => <button key={campaign.id} type="button" onClick={() => onSelect({ kind: 'campaign', campaign })} className="flex items-center justify-between gap-3 rounded-xl p-3 text-left hover:bg-muted"><span className="min-w-0"><span className="block truncate text-sm font-medium">{campaign.name}</span><span className="block truncate text-xs text-muted-foreground">{campaign.goal || t('social.agent_campaigns_empty')}</span></span><Badge variant="outline">{campaign.published + campaign.scheduled}</Badge></button>)}{!activeCampaigns.length ? <p className="text-sm text-muted-foreground">{t('social.agent_campaigns_empty')}</p> : null}</CardContent><CardFooter><Button type="button" variant="outline" className="w-full" onClick={() => onNavigate('campaigns')}>{t('social.studio.overview.manage_campaigns')}</Button></CardFooter></Card></div></div>;
}

function MetricCard({ label, value, hint }: { label: string; value: number | string; hint: string }) { return <Card size="sm"><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-3xl tabular-nums">{value}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">{hint}</p></CardContent></Card>; }

function OverviewList({ title, description, posts, empty, onSelect, action }: { title: string; description: string; posts: SocialPost[]; empty: string; onSelect: (post: SocialPost) => void; action: React.ReactNode }) { return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription><CardAction>{action}</CardAction></CardHeader><CardContent className="flex flex-col gap-1">{posts.map((post) => <PostListButton key={post.id} post={post} onClick={() => onSelect(post)} />)}{!posts.length ? <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p> : null}</CardContent></Card>; }

function ContentView({ posts, filter, onFilter, selectedId, onSelect, onCompose }: { posts: SocialPost[]; filter: SocialContentFilter; onFilter: (filter: SocialContentFilter) => void; selectedId: string | null; onSelect: (post: SocialPost) => void; onCompose: () => void }) {
  const { t } = useTranslation();
  const filters: Array<{ value: SocialContentFilter; label: string }> = [{ value: 'all', label: t('social.agent_filter_all') }, { value: 'draft', label: t('social.agent_stat_drafts') }, { value: 'scheduled', label: t('social.agent_stat_scheduled') }, { value: 'published', label: t('social.agent_stat_recent') }, { value: 'failed', label: t('social.agent_stat_attention') }];
  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 lg:p-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">{t('social.studio.content.eyebrow')}</p><h2 className="font-heading text-2xl font-semibold">{t('social.studio.content.title')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('social.studio.content.description')}</p></div><ToggleGroup value={[filter]} onValueChange={(value) => { if (value[0]) onFilter(value[0] as SocialContentFilter); }} variant="outline" className="flex-wrap">{filters.map((item) => <ToggleGroupItem key={item.value} value={item.value}>{item.label}</ToggleGroupItem>)}</ToggleGroup></div>{posts.length ? <Card><CardContent className="flex flex-col gap-1 p-2">{posts.map((post) => <PostListButton key={post.id} post={post} active={selectedId === post.id} onClick={() => onSelect(post)} />)}</CardContent></Card> : <Empty><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={File02Icon} /></EmptyMedia><EmptyTitle>{t('social.agent_queue_empty')}</EmptyTitle><EmptyDescription>{t('social.studio.content.empty_description')}</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" onClick={onCompose}>{t('social.hub.new_post')}</Button></EmptyContent></Empty>}</div>;
}

function PostListButton({ post, onClick, active = false }: { post: SocialPost; onClick: () => void; active?: boolean }) { const { t } = useTranslation(); const metric = post.metrics; return <button type="button" onClick={onClick} className={cn('grid w-full gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted @[48rem]/social-studio:grid-cols-[9rem_minmax(0,1fr)_auto]', active && 'bg-accent')}><div className="flex items-center gap-2"><ProviderMark provider={post.provider} /><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{PROVIDER_LABELS[post.provider]}</span></div><div className="min-w-0"><p className="truncate text-sm font-medium">{socialPostLabel(post, 100)}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{post.body || '—'}</p></div><div className="flex items-center gap-3"><Badge variant={post.status === 'failed' ? 'destructive' : post.status === 'published' ? 'mint' : 'outline'}>{t(`social.studio.status.${post.status}`)}</Badge><span className="hidden text-xs tabular-nums text-muted-foreground @[48rem]/social-studio:inline">{metric?.impressions != null ? Intl.NumberFormat().format(metric.impressions) : '—'}</span></div></button>; }

function ProviderMark({ provider, className }: { provider: SocialPost['provider']; className?: string }) {
  return (
    <span
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase text-foreground',
        className,
      )}
    >
      {provider === 'linkedin' ? 'in' : provider === 'instagram' ? 'ig' : 'x'}
    </span>
  );
}

function postStatusBadgeVariant(status: SocialPost['status']): 'destructive' | 'mint' | 'secondary' | 'outline' {
  switch (status) {
    case 'failed':
      return 'destructive';
    case 'published':
      return 'mint';
    case 'scheduled':
    case 'publishing':
      return 'secondary';
    case 'draft':
      return 'outline';
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return 'outline';
    }
  }
}

function CampaignsView({ campaigns, posts, selectedId, onSelect, onCreate }: { campaigns: SocialCampaign[]; posts: SocialPost[]; selectedId: string | null; onSelect: (campaign: SocialCampaign) => void; onCreate: () => void }) {
  const { t } = useTranslation();
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 lg:p-6"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">{t('social.studio.campaigns.eyebrow')}</p><h2 className="font-heading text-2xl font-semibold">{t('social.studio.campaigns.title')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('social.studio.campaigns.description')}</p></div><Button type="button" onClick={onCreate}><HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />{t('social.agent_campaign_new')}</Button></div>{campaigns.length ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{campaigns.map((campaign) => { const campaignPosts = posts.filter((post) => post.campaignId === campaign.id); const total = campaignPosts.length; const published = campaignPosts.filter((post) => post.status === 'published').length; const progress = total ? Math.round((published / total) * 100) : 0; return <Card key={campaign.id} className={cn('cursor-pointer transition-shadow hover:shadow-sm', selectedId === campaign.id && 'ring-2 ring-primary')} onClick={() => onSelect(campaign)}><CardHeader><CardTitle className="text-base">{campaign.name}</CardTitle><CardDescription>{campaign.goal || t('social.studio.campaigns.no_goal')}</CardDescription><CardAction><Badge variant={campaign.status === 'active' ? 'mint' : 'outline'}>{t(`social.studio.status.${campaign.status}`)}</Badge></CardAction></CardHeader><CardContent className="flex flex-col gap-3"><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div><div className="flex justify-between text-xs text-muted-foreground"><span>{t('social.studio.campaigns.progress', { progress })}</span><span>{published}/{total}</span></div></CardContent><CardFooter className="gap-2"><Badge variant="outline">{campaign.draft} {t('social.agent_stat_drafts')}</Badge><Badge variant="outline">{campaign.scheduled} {t('social.agent_stat_scheduled')}</Badge></CardFooter></Card>; })}</div> : <Empty><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={Megaphone02Icon} /></EmptyMedia><EmptyTitle>{t('social.agent_campaigns_empty')}</EmptyTitle><EmptyDescription>{t('social.studio.campaigns.empty_description')}</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" onClick={onCreate}>{t('social.agent_campaign_new')}</Button></EmptyContent></Empty>}</div>;
}

function DetailDialog({
  selection,
  onClose,
  onEditPost,
  onPublish,
  onComposeCampaign,
  onPostUpdated,
}: {
  selection: Exclude<SocialSelection, { kind: 'none' } | { kind: 'event' }>;
  onClose: () => void;
  onEditPost: (post: SocialPost) => void;
  onPublish: (post: SocialPost) => void;
  onComposeCampaign: (campaign: SocialCampaign) => void;
  onPostUpdated: (post: SocialPost) => void;
}) {
  const { t, i18n } = useTranslation();
  const title =
    selection.kind === 'post'
      ? t('social.studio.inspector.post_title', { provider: PROVIDER_LABELS[selection.post.provider] })
      : selection.kind === 'campaign'
        ? selection.campaign.name
        : selection.report.title || t('social.reports.untitled');
  const when =
    selection.kind === 'post'
      ? formatSocialWhen(
          selection.post.publishedAt ?? selection.post.scheduledAt ?? selection.post.updatedAt,
          i18n.language,
        )
      : null;
  const contextLabel =
    selection.kind === 'post'
      ? selection.post.campaign || t('social.studio.inspector.organic')
      : t('social.studio.inspector.description');
  const description = selection.kind === 'post'
    ? [when, contextLabel].filter(Boolean).join(' · ')
    : contextLabel;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid h-[min(36rem,calc(100vh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="gap-2 border-b px-6 py-3.5 pr-14">
          {selection.kind === 'post' ? (
            <div className="flex items-start gap-3">
              <ProviderMark provider={selection.post.provider} className="size-9 text-sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-base">{title}</DialogTitle>
                  <Badge variant={postStatusBadgeVariant(selection.post.status)}>
                    {t(`social.studio.status.${selection.post.status}`)}
                  </Badge>
                </div>
                <DialogDescription>{description}</DialogDescription>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{t(`social.studio.inspector.${selection.kind}`)}</Badge>
                {selection.kind === 'campaign' ? (
                  <Badge variant={selection.campaign.status === 'active' ? 'mint' : 'outline'}>
                    {t(`social.studio.status.${selection.campaign.status}`)}
                  </Badge>
                ) : (
                  <Badge variant="outline">{t(`social.studio.status.${selection.report.status}`)}</Badge>
                )}
              </div>
              <DialogTitle className="text-base">{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </>
          )}
        </DialogHeader>

        <div className="min-h-0 overflow-hidden px-6 py-4">
          {selection.kind === 'post' ? (
            <PostInspector post={selection.post} onPostUpdated={onPostUpdated} />
          ) : selection.kind === 'campaign' ? (
            <div className="h-full overflow-y-auto">
              <CampaignInspector campaign={selection.campaign} />
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              <ReportInspector report={selection.report} />
            </div>
          )}
        </div>

        {selection.kind === 'post' ? (
          <>
            <Separator />
            <PostInspectorFooter
              post={selection.post}
              onEdit={() => onEditPost(selection.post)}
              onPublish={() => onPublish(selection.post)}
            />
          </>
        ) : selection.kind === 'campaign' ? (
          <>
            <Separator />
            <DialogFooter className="px-6 py-4 sm:justify-start">
              <Button type="button" onClick={() => onComposeCampaign(selection.campaign)}>
                <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
                {t('social.agent_campaign_add_post')}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function formatSocialBody(body: string): string {
  return body
    .replace(/@\[([^\]]+)]\(urn:li:(?:person|organization):[^)]+\)/g, '@$1')
    .replace(/\{hashtag\|\\?#([^}]+)}/g, '#$1');
}

type PostInspectorTab = 'summary' | 'comments' | 'notes';

function PostInspector({
  post,
  onPostUpdated,
}: {
  post: SocialPost;
  onPostUpdated: (post: SocialPost) => void;
}) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<PostInspectorTab>('summary');
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentsUnsupported, setCommentsUnsupported] = useState(false);
  const [commentsReason, setCommentsReason] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState(post.notes ?? '');
  const [notesSaving, setNotesSaving] = useState(false);

  useEffect(() => {
    setNotesDraft(post.notes ?? '');
  }, [post.id, post.notes]);

  useEffect(() => {
    if (tab !== 'comments') return;
    if (post.status !== 'published' || !post.externalPostId) {
      setComments([]);
      setCommentsUnsupported(false);
      setCommentsReason(null);
      setCommentsError(null);
      return;
    }
    let cancelled = false;
    setCommentsLoading(true);
    setCommentsError(null);
    setCommentsReason(null); (async () => {
      const response = await window.electron.invoke('social:comments:list', { postId: post.id });
      if (cancelled) return;
      setCommentsLoading(false);
      if (!response?.success) {
        setComments([]);
        setCommentsUnsupported(false);
        setCommentsError(response?.error || t('social.studio.inspector.comments_error'));
        return;
      }
      const data = response.data as {
        comments?: SocialComment[];
        unsupported?: boolean;
        reason?: string;
        error?: string;
      };
      setComments(Array.isArray(data?.comments) ? data.comments : []);
      setCommentsUnsupported(Boolean(data?.unsupported));
      setCommentsReason(data?.reason ?? null);
      if (data?.unsupported && data.reason === 'error' && data.error) {
        setCommentsError(data.error);
      }
    })().catch((reason: unknown) => {
      if (cancelled) return;
      setCommentsLoading(false);
      setCommentsError(reason instanceof Error ? reason.message : t('social.studio.inspector.comments_error'));
    });
    return () => {
      cancelled = true;
    };
  }, [post.externalPostId, post.id, post.status, t, tab]);

  const body = formatSocialBody(post.body);
  const media = post.media[0];
  const topics = post.topics.slice(0, 4);
  const commentsCount = post.metrics?.comments;
  const hasNotes = Boolean(post.notes?.trim());

  const saveNotes = async () => {
    setNotesSaving(true);
    try {
      const response = await window.electron.invoke('social:posts:updateNotes', {
        postId: post.id,
        notes: notesDraft.trim() || null,
      });
      if (!response?.success) {
        toast.error(response?.error || t('social.studio.inspector.notes_error'));
        return;
      }
      onPostUpdated({
        ...post,
        ...(response.data as SocialPost),
        metrics: post.metrics,
      });
      toast.success(t('social.studio.inspector.notes_saved'));
    } finally {
      setNotesSaving(false);
    }
  };

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (value === 'summary' || value === 'comments' || value === 'notes') setTab(value);
      }}
      className="flex h-full min-h-0 flex-col gap-3"
    >
      <TabsList variant="line" className="w-full justify-start">
        <TabsTrigger value="summary">{t('social.studio.inspector.tab_summary')}</TabsTrigger>
        <TabsTrigger value="comments">
          {t('social.studio.inspector.tab_comments')}
          {commentsCount != null ? (
            <Badge variant="secondary" className="ml-1">
              {Intl.NumberFormat().format(commentsCount)}
            </Badge>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="notes">
          {t('social.studio.inspector.tab_notes')}
          {hasNotes ? (
            <Badge variant="secondary" className="ml-1">
              1
            </Badge>
          ) : null}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="summary" className="min-h-0 overflow-hidden">
        <div className="flex h-[min(22rem,100%)] flex-col gap-3 overflow-hidden">
          <div className="flex min-h-0 flex-1 gap-3">
            {media?.url && media.type !== 'video' ? (
              <img
                src={media.url}
                alt=""
                className="size-24 shrink-0 rounded-xl bg-muted object-cover ring-1 ring-foreground/10"
              />
            ) : null}
            <Card size="sm" className="min-h-0 flex-1 gap-0 overflow-hidden py-0">
              <CardContent className="flex h-full flex-col gap-2 overflow-hidden px-4 py-3">
                <p className="line-clamp-8 whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {body || t('social.hub.no_text')}
                </p>
                {topics.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {topics.map((topic) => (
                      <Badge key={topic} variant="secondary">
                        #{topic.replace(/^#/, '')}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
          <MetricGrid metrics={post.metrics} status={post.status} compact />
          {post.error ? (
            <Alert variant="destructive">
              <AlertDescription className="line-clamp-2">{post.error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </TabsContent>

      <TabsContent value="comments" className="min-h-0 overflow-hidden">
        <div className="flex h-[min(22rem,100%)] flex-col">
          {post.status !== 'published' || !post.externalPostId ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={File02Icon} />
                </EmptyMedia>
                <EmptyTitle>{t('social.studio.inspector.comments_unpublished_title')}</EmptyTitle>
                <EmptyDescription>{t('social.studio.inspector.comments_unpublished')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : commentsLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              {t('social.studio.inspector.comments_loading')}
            </div>
          ) : commentsError && !commentsUnsupported ? (
            <Alert variant="destructive">
              <AlertDescription>{commentsError}</AlertDescription>
            </Alert>
          ) : commentsUnsupported ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={File02Icon} />
                </EmptyMedia>
                <EmptyTitle>
                  {commentsReason === 'permission'
                    ? t('social.studio.inspector.comments_permission_title')
                    : commentsReason === 'no_account'
                      ? t('social.studio.inspector.comments_no_account_title')
                      : t('social.studio.inspector.comments_unsupported_title')}
                </EmptyTitle>
                <EmptyDescription>
                  {commentsReason === 'permission'
                    ? t('social.studio.inspector.comments_permission', {
                        count: commentsCount ?? 0,
                        provider: PROVIDER_LABELS[post.provider],
                      })
                    : commentsReason === 'no_account'
                      ? t('social.studio.inspector.comments_no_account')
                      : commentsError
                        || t('social.studio.inspector.comments_unsupported')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : comments.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>{t('social.studio.inspector.comments_empty_title')}</EmptyTitle>
                <EmptyDescription>{t('social.studio.inspector.comments_empty')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ScrollArea className="h-full min-h-0">
              <ul className="flex flex-col gap-2 pr-3">
                {comments.map((comment) => (
                  <li key={comment.id} className="rounded-xl bg-muted/50 px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {comment.authorName
                          || comment.authorExternalId
                          || t('social.studio.inspector.comments_anonymous')}
                      </p>
                      {comment.createdAt ? (
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatSocialWhen(comment.createdAt, i18n.language)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-foreground">
                      {comment.text || '—'}
                    </p>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>
      </TabsContent>

      <TabsContent value="notes" className="min-h-0 overflow-hidden">
        <div className="flex h-[min(22rem,100%)] flex-col gap-3">
          <Field className="min-h-0 flex-1">
            <FieldLabel htmlFor={`social-post-notes-${post.id}`}>
              {t('social.studio.inspector.notes_label')}
            </FieldLabel>
            <Textarea
              id={`social-post-notes-${post.id}`}
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
              placeholder={t('social.studio.inspector.notes_placeholder')}
              className="min-h-0 flex-1 resize-none"
            />
            <p className="text-xs text-muted-foreground">{t('social.studio.inspector.notes_hint')}</p>
          </Field>
          <Button
            type="button"
            className="self-end"
            disabled={notesSaving || notesDraft === (post.notes ?? '')}
            onClick={() => { saveNotes().catch(() => undefined);
            }}
          >
            {notesSaving ? <Spinner data-icon="inline-start" /> : null}
            {t('social.studio.inspector.notes_save')}
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function PostInspectorFooter({
  post,
  onEdit,
  onPublish,
}: {
  post: SocialPost;
  onEdit: () => void;
  onPublish: () => void;
}) {
  const { t } = useTranslation();
  const askMany = () => {
    const many = useManyStore.getState();
    many.addPinnedResource({
      id: post.id,
      title: socialPostLabel(post),
      type: 'social_post',
      kind: 'social_post',
      meta: {
        provider: post.provider,
        campaign: post.campaign,
        campaignId: post.campaignId,
        status: post.status,
      },
    });
    many.setPendingOneShotSkill('dome-social-growth');
    many.setPendingManyHandoff(t('social.agent_prompt_about', { snippet: post.body.slice(0, 120) }));
    many.setOpen(true);
  };
  const canPublish = post.status === 'draft' || post.status === 'failed';

  return (
    <DialogFooter className="gap-2 px-6 py-4 sm:justify-between">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onEdit}>
          <HugeiconsIcon icon={Edit02Icon} data-icon="inline-start" />
          {t('common.edit')}
        </Button>
        {canPublish ? (
          <Button type="button" onClick={onPublish}>
            <HugeiconsIcon icon={SentIcon} data-icon="inline-start" />
            {t('social.hub.publish_now')}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {post.externalUrl ? (
          <Button
            render={
              // Base UI injects the Button children into this host element.
              // eslint-disable-next-line jsx-a11y/anchor-has-content
              <a href={post.externalUrl} target="_blank" rel="noreferrer" />
            }
            variant="ghost"
          >
            <HugeiconsIcon icon={ExternalLinkIcon} data-icon="inline-start" />
            {t('social.hub.open_post')}
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={askMany}>
          <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />
          {t('social.agent_ask_many')}
        </Button>
      </div>
    </DialogFooter>
  );
}

function MetricGrid({
  metrics,
  status,
  compact = false,
}: {
  metrics?: SocialMetric | null;
  status?: SocialPost['status'];
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const values = [
    { label: t('social.metrics.impressions'), value: metrics?.impressions },
    { label: t('social.metrics.likes'), value: metrics?.likes },
    { label: t('social.metrics.comments'), value: metrics?.comments },
    { label: t('social.metrics.shares'), value: metrics?.shares },
  ];
  const hasAny = values.some((item) => item.value != null);

  return (
    <div className="flex flex-col gap-1.5">
      {!compact ? (
        <p className="text-xs font-medium text-muted-foreground">{t('social.metrics.title')}</p>
      ) : null}
      <div className="grid grid-cols-4 gap-2">
        {values.map((item) => (
          <Card key={item.label} size="sm" className={cn('gap-0.5', compact ? 'py-2' : 'py-3')}>
            <CardHeader className="px-2.5">
              <CardDescription className="truncate">{item.label}</CardDescription>
              <CardTitle
                className={cn(
                  'tabular-nums',
                  compact ? 'text-base' : 'text-lg',
                  item.value == null && 'font-medium text-muted-foreground/45',
                )}
              >
                {item.value == null ? '—' : Intl.NumberFormat().format(item.value)}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      {!hasAny && status === 'published' ? (
        <p className="line-clamp-1 text-xs text-muted-foreground">{t('social.metrics.pending')}</p>
      ) : null}
    </div>
  );
}

function CampaignInspector({ campaign }: { campaign: SocialCampaign }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {campaign.goal || t('social.studio.campaigns.no_goal')}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label={t('social.agent_stat_drafts')} value={campaign.draft} hint="" />
        <MetricCard label={t('social.agent_stat_scheduled')} value={campaign.scheduled} hint="" />
        <MetricCard label={t('social.agent_stat_recent')} value={campaign.published} hint="" />
        <MetricCard label={t('social.agent_stat_attention')} value={campaign.failed} hint="" />
      </div>
    </div>
  );
}

function ReportInspector({ report }: { report: SocialReport }) {
  const { t } = useTranslation();
  if (report.status === 'failed') {
    return (
      <Card size="sm" className="gap-0 py-0">
        <CardContent className="px-5 py-5">
          <p className="text-sm text-destructive">{report.error || t('social.reports.untitled')}</p>
        </CardContent>
      </Card>
    );
  }
  if (report.status === 'generating' || !report.content) {
    return (
      <Card size="sm" className="gap-0 py-0">
        <CardContent className="px-5 py-5">
          <p className="text-sm text-muted-foreground">{t('social.reports.generating_hint')}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="px-5 py-5">
        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
          <MarkdownRenderer content={report.content} />
        </div>
      </CardContent>
    </Card>
  );
}

function CampaignDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (campaign: SocialCampaign) => Promise<void> }) { const { t } = useTranslation(); const [name, setName] = useState(''); const [goal, setGoal] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const create = async () => { setSaving(true); setError(null); const response = await window.electron.invoke('social:campaigns:create', { name: name.trim(), goal: goal.trim() || null }); setSaving(false); if (!response?.success) return setError(response?.error || 'Error'); setName(''); setGoal(''); onOpenChange(false); await onCreated(response.data); }; return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{t('social.agent_campaign_new')}</DialogTitle><DialogDescription>{t('social.studio.campaigns.dialog_description')}</DialogDescription></DialogHeader><FieldGroup><Field data-invalid={Boolean(error)}><FieldLabel htmlFor="social-campaign-name">{t('social.agent_campaign_prompt_name')}</FieldLabel><Input id="social-campaign-name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(error)} /></Field><Field><FieldLabel htmlFor="social-campaign-goal">{t('social.agent_campaign_prompt_goal')}</FieldLabel><Textarea id="social-campaign-goal" value={goal} onChange={(event) => setGoal(event.target.value)} /></Field>{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}</FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button><Button type="button" onClick={() => create()} disabled={saving || !name.trim()}>{saving ? <Spinner data-icon="inline-start" /> : null}{t('social.agent_campaign_new')}</Button></DialogFooter></DialogContent></Dialog>; }

function WorkspaceSkeleton() { return <div className="mx-auto grid w-full max-w-7xl gap-4 p-6 md:grid-cols-2 xl:grid-cols-4"><Skeleton className="h-44 xl:col-span-4" />{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}<Skeleton className="h-80 md:col-span-2 xl:col-span-3" /><Skeleton className="h-80" /></div>; }
