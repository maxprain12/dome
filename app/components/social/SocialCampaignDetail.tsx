import { Button } from '@/components/ui/button';
import { InlineDetailCard } from '@/components/shared/InlineDetailCard';
import { useTranslation } from 'react-i18next';
import type { SocialCampaign, SocialPost } from '@/components/social/socialTypes';
import { SocialPostRow } from './SocialPostRow';

export function SocialCampaignDetail({
  campaign,
  posts,
  onClose,
  onCompose,
  onOpenPost,
  onAskMany,
}: {
  campaign: SocialCampaign;
  posts: SocialPost[];
  onClose: () => void;
  onCompose: () => void;
  onOpenPost: (post: SocialPost) => void;
  onAskMany: () => void;
}) {
  const { t } = useTranslation();

  return (
    <InlineDetailCard
      onClose={onClose}
      containerName="social-campaign"
      title={campaign.name}
      description={
        campaign.goal ||
        t('social.agent_campaign_counts', {
          draft: campaign.draft,
          scheduled: campaign.scheduled,
          published: campaign.published,
        })
      }
      footer={
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onCompose}>
            {t('social.agent_campaign_add_post')}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onAskMany}>
            {t('social.agent_ask_many')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        {campaign.goal ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{campaign.goal}</p>
        ) : null}
        {posts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('social.agent_campaign_empty_posts')}
          </p>
        ) : (
          posts.map((post) => (
            <SocialPostRow key={post.id} post={post} onOpen={() => onOpenPost(post)} />
          ))
        )}
      </div>
    </InlineDetailCard>
  );
}
