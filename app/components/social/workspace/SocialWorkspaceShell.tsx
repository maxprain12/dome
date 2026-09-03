import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SocialAccountsManager } from '@/components/social/accounts/SocialAccountsManager';
import { SocialComposerWorkspace } from '@/components/social/composer/SocialComposerWorkspace';
import { SocialEventEditor, SocialEventsStudio } from '@/components/social/events/SocialEventsStudio';
import { SocialInsightsStudio } from '@/components/social/insights/SocialInsightsStudio';
import type { SocialCampaign, SocialEventCard, SocialPost } from '@/components/social/socialTypes';
import { formatSocialBody } from '@/components/social/crm/socialCrmChrome';
import { filterPostsByAccount, filterPostsByQuery } from '@/lib/social/socialQueues';
import ListState from '@/components/shared/ListState';
import { CampaignCreateModal } from './CampaignCreateModal';
import { SocialOverviewDashboard } from './SocialOverviewDashboard';
import { contentFilterItems, SocialCampaignsHub, SocialContentHub } from './SocialListHubs';
import { SocialStudioNav } from './SocialStudioNav';
import type { SocialContentFilter, SocialEditor, SocialSection, SocialSelection } from './socialWorkspaceTypes';
import { useSocialWorkspace } from './useSocialWorkspace';

export { formatSocialBody };

export function SocialWorkspaceShell() {
  const { t } = useTranslation();
  const workspace = useSocialWorkspace();
  const [section, setSection] = useState<SocialSection>('overview');
  const [selection, setSelection] = useState<SocialSelection>({ kind: 'none' });
  const [editor, setEditor] = useState<SocialEditor>({ kind: 'none' });
  const [query, setQuery] = useState('');
  const [accountId, setAccountId] = useState<string>('all');
  const [contentFilter, setContentFilter] = useState<SocialContentFilter>('all');
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);

  const navigate = (next: SocialSection, nextSelection: SocialSelection = { kind: 'none' }) => {
    setSection(next);
    setSelection(nextSelection);
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
          setEditor({ kind: 'none' });
          workspace.load().catch(() => {});
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

  const composePost = () => setEditor({ kind: 'post', post: null });
  const selectedPost = selection.kind === 'post' ? selection.post : null;
  const selectedCampaign = selection.kind === 'campaign' ? selection.campaign : null;

  return (
    <div className="social-studio @container/social-studio flex h-full min-h-0 flex-col overflow-hidden bg-card text-foreground">
      <SocialStudioNav
        section={section}
        onNavigate={navigate}
        accounts={workspace.accounts}
        accountId={accountId}
        onAccountId={setAccountId}
        refreshing={workspace.refreshing}
        error={workspace.error}
        lastSyncAt={workspace.lastSyncAt}
        onSync={() => {
          workspace.syncFeed(selectedAccountId).catch(() => {});
        }}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {workspace.loading ? (
          <ListState variant="loading" loadingLabel={t('common.loading')} fullHeight />
        ) : (
          <SectionBody
            section={section}
            filteredPosts={filteredPosts}
            posts={workspace.posts}
            campaigns={workspace.campaigns}
            growth={workspace.growth}
            accounts={workspace.accounts}
            contentFilter={contentFilter}
            query={query}
            selection={selection}
            selectedPost={selectedPost}
            selectedCampaign={selectedCampaign}
            onQueryChange={setQuery}
            onContentFilter={setContentFilter}
            onSelect={setSelection}
            onCompose={composePost}
            onPublish={(post) => {
              workspace.publishPost(post.id).catch(() => {});
            }}
            onEditPost={(post) => setEditor({ kind: 'post', post })}
            onPostUpdated={(post) => {
              setSelection({ kind: 'post', post });
              workspace.load().catch(() => {});
            }}
            onCreateCampaign={() => setCampaignDialogOpen(true)}
            onComposeCampaign={(campaign) =>
              setEditor({
                kind: 'post',
                post: null,
                campaignId: campaign.id,
                campaignName: campaign.name,
              })
            }
            onEditEvent={(card) => setEditor({ kind: 'event', card })}
            onNavigate={navigate}
            accountId={selectedAccountId}
          />
        )}
      </div>

      <CampaignCreateModal
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

function SectionBody({
  section,
  filteredPosts,
  posts,
  campaigns,
  growth,
  accounts,
  contentFilter,
  query,
  selection,
  selectedPost,
  selectedCampaign,
  onQueryChange,
  onContentFilter,
  onSelect,
  onCompose,
  onPublish,
  onEditPost,
  onPostUpdated,
  onCreateCampaign,
  onComposeCampaign,
  onEditEvent,
  onNavigate,
  accountId,
}: {
  section: SocialSection;
  filteredPosts: SocialPost[];
  posts: SocialPost[];
  campaigns: ReturnType<typeof useSocialWorkspace>['campaigns'];
  growth: ReturnType<typeof useSocialWorkspace>['growth'];
  accounts: ReturnType<typeof useSocialWorkspace>['accounts'];
  contentFilter: SocialContentFilter;
  query: string;
  selection: SocialSelection;
  selectedPost: SocialPost | null;
  selectedCampaign: SocialCampaign | null;
  onQueryChange: (query: string) => void;
  onContentFilter: (filter: SocialContentFilter) => void;
  onSelect: (selection: SocialSelection) => void;
  onCompose: () => void;
  onPublish: (post: SocialPost) => void;
  onEditPost: (post: SocialPost) => void;
  onPostUpdated: (post: SocialPost) => void;
  onCreateCampaign: () => void;
  onComposeCampaign: (campaign: SocialCampaign) => void;
  onEditEvent: (card: SocialEventCard | null) => void;
  onNavigate: (section: SocialSection, selection?: SocialSelection) => void;
  accountId: string | null;
}) {
  const { t } = useTranslation();

  switch (section) {
    case 'overview':
      return (
        <SocialOverviewDashboard
          posts={filteredPosts}
          growth={growth}
          accountId={accountId}
          onCompose={onCompose}
          onOpenPost={(post) => onNavigate('content', { kind: 'post', post })}
          onOpenContent={() => onNavigate('content')}
        />
      );
    case 'content':
      return (
        <SocialContentHub
          title={t('social.studio.nav.content')}
          posts={filteredPosts}
          filter={contentFilter}
          onFilter={(next) => onContentFilter(next as SocialContentFilter)}
          filterItems={contentFilterItems(t)}
          selectedPost={selectedPost}
          onSelectPost={(post) => onSelect({ kind: 'post', post })}
          onCompose={onCompose}
          onPublish={onPublish}
          onEditPost={onEditPost}
          onPostUpdated={onPostUpdated}
          query={query}
          onQueryChange={onQueryChange}
        />
      );
    case 'campaigns':
      return (
        <SocialCampaignsHub
          campaigns={campaigns}
          posts={posts}
          selectedCampaign={selectedCampaign}
          onSelect={(campaign) => onSelect({ kind: 'campaign', campaign })}
          onCreate={onCreateCampaign}
          onComposeCampaign={onComposeCampaign}
          onSelectPost={(post) => onSelect({ kind: 'post', post })}
          query={query}
          onQueryChange={onQueryChange}
        />
      );
    case 'events':
      return <SocialEventsStudio accounts={accounts} posts={posts} onEdit={onEditEvent} />;
    case 'insights':
      return (
        <SocialInsightsStudio
          growth={growth}
          posts={filteredPosts}
          selectedReport={selection.kind === 'report' ? selection.report : null}
          onSelectReport={(report) => onSelect({ kind: 'report', report })}
          onOpenEvents={() => onNavigate('events')}
          onOpenAccounts={() => onNavigate('accounts')}
        />
      );
    case 'accounts':
      return <SocialAccountsManager embedded />;
    default: {
      const _exhaustive: never = section;
      void _exhaustive;
      return null;
    }
  }
}
