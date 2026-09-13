import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { LinkSquare01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
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
  const title = info.name || handleLabel || person.displayName;
  const stats = [
    info.followersCount != null
      ? t('people.ig_followers', { count: formatFollowerCount(info.followersCount) })
      : null,
    info.mediaCount != null ? t('people.ig_media_count', { count: info.mediaCount }) : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <FieldSet>
      <FieldLegend>{t('people.section_instagram')}</FieldLegend>
      <FieldDescription>{t('people.section_instagram_hint')}</FieldDescription>
      <FieldGroup>
        <div className="flex items-start gap-3">
          <Avatar size="lg">
            {info.avatarUrl ? <AvatarImage src={info.avatarUrl} alt={title} /> : null}
            <AvatarFallback>{personInitial(person)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold">{title}</p>
              {dmSent ? <Badge variant="secondary">{t('people.dm_sent_badge')}</Badge> : null}
            </div>
            {stats.length > 0 ? (
              <p className="text-xs text-muted-foreground">{stats.join(' · ')}</p>
            ) : null}
          </div>
        </div>
        {handleLabel ? (
          <Field>
            <FieldLabel>{t('people.ig_handle')}</FieldLabel>
            <p className="text-sm">{handleLabel}</p>
          </Field>
        ) : null}
        {info.biography ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{info.biography}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={enriching} onClick={onEnrich}>
            {enriching ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
            )}
            {enriching ? t('people.enriching') : t('people.enrich_profile')}
          </Button>
          {info.profileUrl ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<a href={info.profileUrl} target="_blank" rel="noreferrer" aria-label={t('people.open_instagram_profile')} />}
            >
              <HugeiconsIcon icon={LinkSquare01Icon} data-icon="inline-start" />
              {t('people.open_instagram_profile')}
            </Button>
          ) : null}
        </div>
      </FieldGroup>
    </FieldSet>
  );
}
