import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { File02Icon, Megaphone02Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import type { SocialCampaign, SocialPost } from '@/components/social/socialTypes';
import { ProviderMark } from '@/components/social/crm/socialCrmChrome';
import { formatSocialWhen, socialPostLabel } from '@/lib/social/socialQueues';
import type { SocialContentFilter } from './socialWorkspaceTypes';
import {
  SocialDirectoryColumn,
  SocialDirectoryRow,
  SocialFichaEmpty,
  SocialHubSplit,
  type SortDir,
} from './SocialDirectoryColumn';
import { SocialCampaignDetailPanel } from './SocialCampaignDetailPanel';
import { SocialPostDetailPanel } from './SocialPostDetailPanel';

function sortByLabel<T>(items: T[], label: (item: T) => string, dir: SortDir): T[] {
  const next = [...items];
  next.sort((a, b) => {
    const cmp = label(a).localeCompare(label(b), undefined, { sensitivity: 'base' });
    return dir === 'az' ? cmp : -cmp;
  });
  return next;
}

export function SocialContentHub({
  title,
  posts,
  filter,
  onFilter,
  filterItems,
  selectedPost,
  onSelectPost,
  onCompose,
  onPublish,
  onEditPost,
  onPostUpdated,
  query,
  onQueryChange,
}: {
  title: string;
  posts: SocialPost[];
  filter: string;
  onFilter: (filter: string) => void;
  filterItems: Array<{ value: string; label: string }>;
  selectedPost: SocialPost | null;
  onSelectPost: (post: SocialPost) => void;
  onCompose: () => void;
  onPublish: (post: SocialPost) => void;
  onEditPost: (post: SocialPost) => void;
  onPostUpdated: (post: SocialPost) => void;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [sortDir, setSortDir] = useState<SortDir>('az');
  const sorted = useMemo(
    () => sortByLabel(posts, (post) => socialPostLabel(post), sortDir),
    [posts, sortDir],
  );

  return (
    <SocialHubSplit>
      <SocialDirectoryColumn
        title={title}
        action={
          <Button type="button" size="sm" onClick={onCompose}>
            <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
            {t('social.hub.new_post')}
          </Button>
        }
        query={query}
        onQueryChange={onQueryChange}
        queryPlaceholder={t('social.agent_search')}
        filter={filter}
        onFilterChange={onFilter}
        filterItems={filterItems}
        filterAriaLabel={t('social.studio.crm.filter_by')}
        sortDir={sortDir}
        onSortDir={setSortDir}
        sortAzLabel={t('social.studio.crm.sort_az')}
        sortZaLabel={t('social.studio.crm.sort_za')}
        empty={
          posts.length === 0
            ? {
                icon: <HugeiconsIcon icon={File02Icon} className="size-8" />,
                title: t('social.agent_queue_empty'),
                description: t('social.studio.content.empty_description'),
              }
            : undefined
        }
      >
        <ul className="flex flex-col">
          {sorted.map((post) => (
            <SocialDirectoryRow
              key={post.id}
              selected={selectedPost?.id === post.id}
              onClick={() => onSelectPost(post)}
              mark={<ProviderMark provider={post.provider} />}
              title={socialPostLabel(post)}
              subtitle={formatSocialWhen(
                post.publishedAt ?? post.scheduledAt ?? post.updatedAt,
                i18n.language,
              )}
            />
          ))}
        </ul>
      </SocialDirectoryColumn>
      {selectedPost ? (
        <SocialPostDetailPanel
          post={selectedPost}
          onEdit={() => onEditPost(selectedPost)}
          onPublish={() => onPublish(selectedPost)}
          onPostUpdated={onPostUpdated}
        />
      ) : (
        <SocialFichaEmpty
          icon={<HugeiconsIcon icon={File02Icon} className="size-8" />}
          title={t('social.studio.crm.detail_empty_post')}
          description={t('social.studio.crm.detail_empty_post_hint')}
        />
      )}
    </SocialHubSplit>
  );
}

export function SocialCampaignsHub({
  campaigns,
  posts,
  selectedCampaign,
  onSelect,
  onCreate,
  onComposeCampaign,
  onSelectPost,
  query,
  onQueryChange,
}: {
  campaigns: SocialCampaign[];
  posts: SocialPost[];
  selectedCampaign: SocialCampaign | null;
  onSelect: (campaign: SocialCampaign) => void;
  onCreate: () => void;
  onComposeCampaign: (campaign: SocialCampaign) => void;
  onSelectPost: (post: SocialPost) => void;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const { t } = useTranslation();
  const [sortDir, setSortDir] = useState<SortDir>('az');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? campaigns.filter(
          (campaign) =>
            campaign.name.toLowerCase().includes(q) ||
            (campaign.goal ?? '').toLowerCase().includes(q),
        )
      : campaigns;
    return sortByLabel(rows, (campaign) => campaign.name, sortDir);
  }, [campaigns, query, sortDir]);

  return (
    <SocialHubSplit>
      <SocialDirectoryColumn
        title={t('social.studio.nav.campaigns')}
        action={
          <Button type="button" size="sm" onClick={onCreate}>
            <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
            {t('social.agent_campaign_new')}
          </Button>
        }
        query={query}
        onQueryChange={onQueryChange}
        queryPlaceholder={t('social.agent_search')}
        sortDir={sortDir}
        onSortDir={setSortDir}
        sortAzLabel={t('social.studio.crm.sort_az')}
        sortZaLabel={t('social.studio.crm.sort_za')}
        empty={
          filtered.length === 0
            ? {
                icon: <HugeiconsIcon icon={Megaphone02Icon} className="size-8" />,
                title: t('social.agent_campaigns_empty'),
                description: t('social.studio.campaigns.empty_description'),
              }
            : undefined
        }
      >
        <ul className="flex flex-col">
          {filtered.map((campaign) => (
            <SocialDirectoryRow
              key={campaign.id}
              selected={selectedCampaign?.id === campaign.id}
              onClick={() => onSelect(campaign)}
              title={campaign.name}
              subtitle={campaign.goal || t('social.studio.campaigns.no_goal')}
            />
          ))}
        </ul>
      </SocialDirectoryColumn>
      {selectedCampaign ? (
        <SocialCampaignDetailPanel
          campaign={selectedCampaign}
          posts={posts}
          onCompose={() => onComposeCampaign(selectedCampaign)}
          onSelectPost={onSelectPost}
        />
      ) : (
        <SocialFichaEmpty
          icon={<HugeiconsIcon icon={Megaphone02Icon} className="size-8" />}
          title={t('social.studio.crm.detail_empty_campaign')}
          description={t('social.studio.crm.detail_empty_campaign_hint')}
        />
      )}
    </SocialHubSplit>
  );
}

export function contentFilterItems(
  t: (key: string) => string,
): Array<{ value: SocialContentFilter; label: string }> {
  return [
    { value: 'all', label: t('social.agent_filter_all') },
    { value: 'draft', label: t('social.agent_stat_drafts') },
    { value: 'scheduled', label: t('social.agent_stat_scheduled') },
    { value: 'published', label: t('social.agent_stat_recent') },
    { value: 'failed', label: t('social.agent_stat_attention') },
  ];
}
