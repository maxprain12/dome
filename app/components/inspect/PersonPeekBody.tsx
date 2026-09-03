import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { identityHref, identityLabel } from '@/components/people/identityHref';
import { leadStatusBadgeVariant, personDisplayLabel, personInitial } from '@/components/people/peopleLabels';
import { personStatusLabel } from '@/components/people/personStatuses';
import {
  CORE_PROFILE_KEYS,
  coreProfileValue,
} from '@/components/people/personProfileFields';
import type { PersonDetail } from '@/components/people/peopleTypes';
import { focusPerson } from '@/lib/store/useOpenIntentStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { cn } from '@/lib/utils';

const PEEK_PROFILE_KEYS = CORE_PROFILE_KEYS.slice(0, 5);

function profileString(profile: Record<string, unknown> | undefined, key: string): string | null {
  const value = profile?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function PersonPeekBody({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const electron = globalThis.window?.electron;
    if (!electron?.people) {
      setLoading(false);
      setError(true);
      return;
    }
    electron.people
      .get({ id: personId, includeInteractions: true })
      .then((res) => {
        if (cancelled) return;
        if (!res.success || !res.data?.person) {
          setError(true);
          setPerson(null);
          return;
        }
        setPerson(res.data.person as PersonDetail);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setPerson(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  const openInPeople = () => {
    useTabStore.getState().openPeopleTab();
    focusPerson({ personId });
  };

  if (loading) {
    return <p className="text-xs text-muted-foreground">{t('inspect.loading')}</p>;
  }
  if (error || !person) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">{t('inspect.load_error')}</p>
        <Button type="button" size="sm" onClick={openInPeople}>
          {t('inspect.open_in_people')}
        </Button>
      </div>
    );
  }

  const identities = person.identities ?? [];
  const profile = person.profile ?? {};
  const fields = PEEK_PROFILE_KEYS
    .map((key) => {
      const value = coreProfileValue(profile, key);
      return value.trim() ? { key, value: value.trim() } : null;
    })
    .filter((row): row is { key: typeof PEEK_PROFILE_KEYS[number]; value: string } => row != null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <Avatar size="lg">
          {person.avatarUrl || profileString(profile, 'instagram_avatar') ? (
            <AvatarImage
              src={person.avatarUrl || profileString(profile, 'instagram_avatar') || undefined}
              alt={personDisplayLabel(person)}
            />
          ) : null}
          <AvatarFallback>{personInitial(person)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 truncate text-sm font-semibold">{personDisplayLabel(person)}</h3>
            <Badge variant={leadStatusBadgeVariant(person.leadStatus)}>
              {personStatusLabel(person.leadStatus, t)}
            </Badge>
          </div>
          {person.primaryEmail ? (
            <p className="truncate text-xs text-muted-foreground">{person.primaryEmail}</p>
          ) : null}
        </div>
      </div>

      {fields.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('inspect.profile')}
          </h4>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            {fields.map((field) => (
              <div key={field.key} className="contents">
                <dt className="text-muted-foreground">{t(`people.profile_${field.key}`)}</dt>
                <dd className="m-0 min-w-0 truncate" title={field.value}>
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('inspect.identities')}
        </h4>
        {identities.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('people.identities_empty')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {identities.map((identity) => {
              const href = identityHref(identity);
              const label = identityLabel(identity);
              const key = `${identity.source}:${identity.externalId}`;
              if (href) {
                return (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                  >
                    {label}
                  </a>
                );
              }
              return (
                <Button key={key} type="button" variant="outline" size="sm">
                  {label}
                </Button>
              );
            })}
          </div>
        )}
      </section>

      <Button type="button" size="sm" className="self-start" onClick={openInPeople}>
        {t('inspect.open_in_people')}
      </Button>
    </div>
  );
}
