import type {
  SocialCampaign,
  SocialEventCard,
  SocialPost,
  SocialReport,
} from '@/components/social/socialTypes';

export type SocialSection =
  | 'overview'
  | 'content'
  | 'campaigns'
  | 'events'
  | 'insights'
  | 'inbox'
  | 'accounts';

export type SocialSelection =
  | { kind: 'none' }
  | { kind: 'post'; post: SocialPost }
  | { kind: 'campaign'; campaign: SocialCampaign }
  | { kind: 'event'; card: SocialEventCard }
  | { kind: 'report'; report: SocialReport };

export type SocialEditor =
  | { kind: 'none' }
  | {
      kind: 'post';
      post: SocialPost | null;
      campaignId?: string | null;
      campaignName?: string | null;
    }
  | { kind: 'campaign' }
  | { kind: 'event'; card: SocialEventCard | null };

export type SocialContentFilter =
  | 'all'
  | 'draft'
  | 'scheduled'
  | 'published'
  | 'failed';
