import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { BubbleChatIcon, Megaphone02Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SocialCampaign, SocialPost } from '@/components/social/socialTypes';
import {
  ActionIcon,
  ProviderMark,
  ReadField,
  SectionCard,
  campaignStatusBadgeVariant,
} from '@/components/social/crm/socialCrmChrome';
import { SocialDirectoryRow } from './SocialDirectoryColumn';
import { hubFichaTitleClass } from '@/components/shared/hubChrome';
import { socialPostLabel } from '@/lib/social/socialQueues';
import { useManyStore } from '@/lib/store/useManyStore';

export function SocialCampaignDetailPanel({
  campaign,
  posts,
  onCompose,
  onSelectPost,
}: {
  campaign: SocialCampaign;
  posts: SocialPost[];
  onCompose: () => void;
  onSelectPost?: (post: SocialPost) => void;
}) {
  const { t } = useTranslation();
  const campaignPosts = posts.filter((post) => post.campaignId === campaign.id);
  const total = campaignPosts.length;
  const published = campaignPosts.filter((post) => post.status === 'published').length;
  const progress = total ? Math.round((published / total) * 100) : 0;
  const unavailable = t('social.studio.crm.unavailable');

  const handleMany = () => {
    const many = useManyStore.getState();
    many.addPinnedResource({
      id: campaign.id,
      title: campaign.name,
      type: 'social_campaign',
      meta: { status: campaign.status, goal: campaign.goal },
    });
    many.setPendingOneShotSkill('dome-social-growth');
    many.setPendingManyHandoff(
      t('social.agent_action_campaign') + (campaign.goal ? `: ${campaign.goal}` : ''),
    );
    many.setOpen(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col items-center gap-2 border-b px-3 pb-4 pt-4">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <HugeiconsIcon icon={Megaphone02Icon} />
        </div>
        <div className="flex max-w-full flex-col items-center gap-1 text-center">
          <div className="flex max-w-full items-center gap-2">
            <h2 className={hubFichaTitleClass}>{campaign.name}</h2>
            <Badge variant={campaignStatusBadgeVariant(campaign.status)}>
              {t(`social.studio.status.${campaign.status}`)}
            </Badge>
          </div>
          <p className="max-w-full truncate text-xs text-muted-foreground">
            {campaign.goal || t('social.studio.campaigns.no_goal')}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <ActionIcon
            label={t('social.agent_campaign_add_post')}
            available
            unavailableLabel={unavailable}
            icon={PlusSignIcon}
            onClick={onCompose}
          />
          <ActionIcon
            label={t('social.agent_ask_many')}
            available
            unavailableLabel={unavailable}
            icon={BubbleChatIcon}
            onClick={handleMany}
          />
        </div>
      </div>
      <Tabs defaultValue="info" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList variant="line" className="w-full justify-start rounded-none border-b px-3">
          <TabsTrigger value="info">{t('social.studio.crm.tab_info')}</TabsTrigger>
          <TabsTrigger value="posts">{t('social.studio.crm.tab_posts')}</TabsTrigger>
        </TabsList>
        <TabsContent value="info" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-3">
              <SectionCard title={t('social.studio.crm.tab_info')}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ReadField label={t('social.studio.campaigns.progress', { progress })} value={`${published}/${total}`} />
                  <ReadField label={t('social.agent_stat_drafts')} value={String(campaign.draft)} />
                  <ReadField label={t('social.agent_stat_scheduled')} value={String(campaign.scheduled)} />
                  <ReadField label={t('social.agent_stat_recent')} value={String(campaign.published)} />
                  <ReadField label={t('social.agent_stat_attention')} value={String(campaign.failed)} />
                </div>
              </SectionCard>
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="posts" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {campaignPosts.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t('social.studio.content.empty_description')}
              </p>
            ) : (
              <ul className="flex flex-col">
                {campaignPosts.map((post) => (
                  <SocialDirectoryRow
                    key={post.id}
                    selected={false}
                    onClick={() => onSelectPost?.(post)}
                    mark={<ProviderMark provider={post.provider} />}
                    title={socialPostLabel(post)}
                    subtitle={t(`social.studio.status.${post.status}`)}
                  />
                ))}
              </ul>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
