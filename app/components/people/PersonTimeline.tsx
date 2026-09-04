import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Calendar03Icon,
  GitBranchIcon,
  InstagramIcon,
  LinkSquare01Icon,
  Mail01Icon,
  Note01Icon,
  Share08Icon,
} from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from '@/lib/utils/formatting';
import { looksLikeOpaqueId, socialEventCardLabel } from '@/lib/social/socialQueues';
import type { SocialEventCard } from '@/components/social/socialTypes';
import type { PersonInteraction } from './peopleTypes';

const KIND_ICON: Record<string, typeof Note01Icon> = {
  note: Note01Icon,
  email: Mail01Icon,
  github: GitBranchIcon,
  social: Share08Icon,
  instagram: InstagramIcon,
  calendar: Calendar03Icon,
};

function iconForKind(kind: string): typeof Note01Icon {
  for (const [prefix, icon] of Object.entries(KIND_ICON)) {
    if (kind.startsWith(prefix)) return icon;
  }
  return Note01Icon;
}

function payloadString(payload: Record<string, unknown> | undefined, key: string): string | null {
  const value = payload?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function payloadBool(payload: Record<string, unknown> | undefined, key: string): boolean {
  return payload?.[key] === true;
}

function extractCommentText(interaction: PersonInteraction): string | null {
  const fromPayload = payloadString(interaction.payload, 'commentText');
  if (fromPayload) return fromPayload;
  return interaction.summary?.startsWith('Commented: ')
    ? interaction.summary.slice('Commented: '.length)
    : null;
}

function extractCardTitle(
  payload: Record<string, unknown> | undefined,
  cardLabels: Record<string, string>,
): string | null {
  const raw = payloadString(payload, 'cardTitle');
  if (raw && !looksLikeOpaqueId(raw)) return raw;
  const cardId = payloadString(payload, 'cardId');
  return cardId ? cardLabels[cardId] ?? null : null;
}

function isDmSent(interaction: PersonInteraction): boolean {
  return payloadBool(interaction.payload, 'dmSent') || interaction.refType === 'dm_rule';
}

interface IgCommentBodyProps {
  commentText: string | null;
  cardTitle: string | null;
  mediaPermalink: string | null;
  dmSent: boolean;
}

function IgCommentBody({ commentText, cardTitle, mediaPermalink, dmSent }: IgCommentBodyProps) {
  const { t } = useTranslation();
  return (
    <>
      {commentText ? (
        <p className="text-xs text-foreground whitespace-pre-wrap">&ldquo;{commentText}&rdquo;</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {dmSent ? <Badge variant="secondary">{t('people.dm_sent_badge')}</Badge> : null}
        {cardTitle ? (
          <span className="text-[0.6875rem] text-muted-foreground">
            {t('people.timeline_on_post', { post: cardTitle })}
          </span>
        ) : null}
        {mediaPermalink ? (
          <a
            href={mediaPermalink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-[0.6875rem] text-primary underline-offset-2 hover:underline"
          >
            <HugeiconsIcon icon={LinkSquare01Icon} size={11} />
            {t('people.timeline_view_post')}
          </a>
        ) : null}
      </div>
    </>
  );
}

interface TimelineEntryProps {
  interaction: PersonInteraction;
  cardLabels: Record<string, string>;
}

function TimelineEntry({ interaction, cardLabels }: TimelineEntryProps) {
  const { t } = useTranslation();
  const isIgComment = interaction.kind === 'instagram_comment_match';
  const commentText = extractCommentText(interaction);
  const cardTitle = extractCardTitle(interaction.payload, cardLabels);
  const mediaPermalink = payloadString(interaction.payload, 'mediaPermalink');
  const dmSent = isDmSent(interaction);

  return (
    <li className="flex gap-2.5">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <HugeiconsIcon icon={iconForKind(interaction.kind)} size={13} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium">
            {isIgComment
              ? t('people.timeline_ig_comment')
              : interaction.kind.replace(/_/g, ' ')}
          </span>
          <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
            {formatDistanceToNow(interaction.occurredAt)}
          </span>
        </div>
        {isIgComment ? (
          <IgCommentBody
            commentText={commentText}
            cardTitle={cardTitle}
            mediaPermalink={mediaPermalink}
            dmSent={dmSent}
          />
        ) : interaction.summary ? (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{interaction.summary}</p>
        ) : null}
      </div>
    </li>
  );
}

interface PersonTimelineProps {
  interactions: PersonInteraction[];
}

export default function PersonTimeline({ interactions }: PersonTimelineProps) {
  const { t } = useTranslation();
  const [cardLabels, setCardLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    const cardIds = Array.from(
      new Set(
        interactions
          .map((i) => payloadString(i.payload, 'cardId'))
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (cardIds.length === 0 || !window.electron?.invoke) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = (await window.electron.invoke('social:event-cards:list')) as {
          success?: boolean;
          data?: { cards?: SocialEventCard[] };
        };
        const cards = res?.data?.cards ?? [];
        if (!Array.isArray(cards) || cancelled) return;
        const map: Record<string, string> = {};
        for (const card of cards) {
          if (!card?.id) continue;
          map[card.id] = socialEventCardLabel(card);
        }
        setCardLabels(map);
      } catch {
        /* optional */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [interactions]);

  if (interactions.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('people.timeline_empty')}</p>;
  }

  return (
    <ol className="flex flex-col gap-2.5">
      {interactions.map((interaction) => (
        <TimelineEntry key={interaction.id} interaction={interaction} cardLabels={cardLabels} />
      ))}
    </ol>
  );
}
