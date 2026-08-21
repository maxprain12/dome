import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { LinkSquare01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatFollowerCount, type InstagramLeadInfo } from './instagramLead';
import { personInitial } from './peopleLabels';
import type { PersonDetail } from './peopleTypes';

interface InstagramLeadCardProps {
  person: PersonDetail;
  info: InstagramLeadInfo;
  enriching?: boolean;
  onEnrich: () => void;
  dmSent?: boolean;
}

export default function InstagramLeadCard({
  person,
  info,
  enriching = false,
  onEnrich,
  dmSent = false,
}: InstagramLeadCardProps) {
  const { t } = useTranslation();
  const handleLabel = info.handle ? `@${info.handle.replace(/^@/, '')}` : null;

  return (
    <section className="flex flex-col gap-2.5 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-start gap-3">
        <Avatar size="lg">
          {info.avatarUrl ? (
            <AvatarImage src={info.avatarUrl} alt={info.name || handleLabel || person.displayName} />
          ) : null}
          <AvatarFallback>{personInitial(person)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold">
              {info.name || handleLabel || person.displayName}
            </h3>
            {handleLabel ? (
              <span className="truncate text-xs text-muted-foreground">{handleLabel}</span>
            ) : null}
            {dmSent ? <Badge variant="secondary">{t('people.dm_sent_badge')}</Badge> : null}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.6875rem] text-muted-foreground">
            {info.followersCount != null ? (
              <span>
                {t('people.ig_followers', { count: formatFollowerCount(info.followersCount) })}
              </span>
            ) : null}
            {info.mediaCount != null ? (
              <span>{t('people.ig_media_count', { count: info.mediaCount })}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={enriching}
            onClick={onEnrich}
          >
            <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
            {enriching ? t('people.enriching') : t('people.enrich_profile')}
          </Button>
          {info.profileUrl ? (
            <a
              href={info.profileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1 text-[0.6875rem] text-primary underline-offset-2 hover:underline"
            >
              <HugeiconsIcon icon={LinkSquare01Icon} size={12} />
              {t('people.open_instagram_profile')}
            </a>
          ) : null}
        </div>
      </div>
      {info.biography ? (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{info.biography}</p>
      ) : null}
      {info.website ? (
        <a
          href={info.website.startsWith('http') ? info.website : `https://${info.website}`}
          target="_blank"
          rel="noreferrer"
          className="truncate text-xs text-primary underline-offset-2 hover:underline"
        >
          {info.website}
        </a>
      ) : null}
    </section>
  );
}
