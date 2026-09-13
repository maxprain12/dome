import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { SocialMediaItem, SocialPostSource } from '@/components/social/socialTypes';

type UserTag = { username: string; x?: number; y?: number };
type LocationChoice = { id: string; name: string };

export type InstagramNativeValue = {
  location: LocationChoice | null;
  userTags: UserTag[];
  collaborators: string[];
  audioName: string;
};

export function instagramSourceFromNative(value: InstagramNativeValue): SocialPostSource | null {
  const source: SocialPostSource = {};
  if (value.location?.name) source.location = value.location;
  if (value.userTags.length) source.userTags = value.userTags;
  if (value.collaborators.length) source.collaborators = value.collaborators;
  if (value.audioName.trim()) source.audioName = value.audioName.trim();
  return Object.keys(source).length ? source : null;
}

function commitUsername(draft: string, existing: string[]): string | null {
  const username = draft.replace(/^@/, '').trim();
  if (!username) return null;
  const key = username.toLowerCase();
  if (existing.some((name) => name.toLowerCase() === key)) return null;
  return username;
}

export function InstagramNativeFields({
  accountId,
  media,
  value,
  onChange,
}: {
  accountId?: string;
  media: SocialMediaItem[];
  value: InstagramNativeValue;
  onChange: (next: InstagramNativeValue) => void;
}) {
  const { t } = useTranslation();
  const [peopleDraft, setPeopleDraft] = useState('');
  const [collabDraft, setCollabDraft] = useState('');
  const [locationQuery, setLocationQuery] = useState(value.location?.name ?? '');
  const [locationResults, setLocationResults] = useState<LocationChoice[]>([]);
  const [locationUnsupported, setLocationUnsupported] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [activeTag, setActiveTag] = useState(0);
  const image = media.find((item) => item.type !== 'video' && item.type !== 'reel' && item.url);
  const hasVideo = media.some((item) => item.type === 'video' || item.type === 'reel');

  const addPerson = () => {
    const username = commitUsername(peopleDraft, value.userTags.map((tag) => tag.username));
    if (!username) return;
    onChange({ ...value, userTags: [...value.userTags, { username, x: 0.5, y: 0.5 }] });
    setPeopleDraft('');
    setActiveTag(value.userTags.length);
  };

  const addCollaborator = () => {
    if (value.collaborators.length >= 3) return;
    const username = commitUsername(collabDraft, value.collaborators);
    if (!username) return;
    onChange({ ...value, collaborators: [...value.collaborators, username] });
    setCollabDraft('');
  };

  const searchLocation = () => {
    const query = locationQuery.trim();
    if (!query || !accountId) return;
    setLocationBusy(true);
    window.electron.invoke('social:instagram:searchLocations', { accountId, query }).then((response) => {
      setLocationBusy(false);
      if (!response?.success) {
        setLocationUnsupported(true);
        setLocationResults([]);
        return;
      }
      const data = response.data as { locations?: LocationChoice[]; searchUnsupported?: boolean };
      setLocationUnsupported(Boolean(data?.searchUnsupported));
      setLocationResults(Array.isArray(data?.locations) ? data.locations : []);
    }).catch(() => {
      setLocationBusy(false);
      setLocationUnsupported(true);
    });
  };

  const placeTag = (event: MouseEvent<HTMLButtonElement>) => {
    if (!value.userTags.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const index = Math.min(activeTag, value.userTags.length - 1);
    onChange({
      ...value,
      userTags: value.userTags.map((tag, tagIndex) => (tagIndex === index ? { ...tag, x, y } : tag)),
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field className="md:col-span-2">
        <FieldLabel htmlFor="social-ig-people">{t('social.composer.ig_people')}</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {value.userTags.map((tag, index) => (
            <Badge key={`${tag.username}-${index}`} variant={index === activeTag ? 'default' : 'secondary'}>
              <button type="button" className="truncate" onClick={() => setActiveTag(index)}>
                @{tag.username}
              </button>
              <button
                type="button"
                aria-label={t('common.delete')}
                onClick={() => onChange({ ...value, userTags: value.userTags.filter((_, tagIndex) => tagIndex !== index) })}
              >
                <HugeiconsIcon icon={Cancel01Icon} />
              </button>
            </Badge>
          ))}
        </div>
        <Input
          id="social-ig-people"
          value={peopleDraft}
          onChange={(event) => setPeopleDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              addPerson();
            }
          }}
          placeholder={t('social.composer.ig_people_placeholder')}
        />
        <FieldDescription>{t('social.composer.ig_people_hint')}</FieldDescription>
        {image?.url ? (
          <button
            type="button"
            className="relative mt-2 max-w-56 overflow-hidden rounded-md border"
            onClick={placeTag}
            aria-label={t('social.composer.ig_people_place')}
          >
            <img src={image.url} alt="" className="aspect-square w-full object-cover" />
            {value.userTags.map((tag, index) => (
              <span
                key={`${tag.username}-pin-${index}`}
                className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background"
                style={{ left: `${(tag.x ?? 0.5) * 100}%`, top: `${(tag.y ?? 0.5) * 100}%` }}
              />
            ))}
          </button>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="social-ig-collab">{t('social.composer.ig_collaborators')}</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {value.collaborators.map((name) => (
            <Badge key={name} variant="secondary">
              @{name}
              <button
                type="button"
                aria-label={t('common.delete')}
                onClick={() => onChange({ ...value, collaborators: value.collaborators.filter((item) => item !== name) })}
              >
                <HugeiconsIcon icon={Cancel01Icon} />
              </button>
            </Badge>
          ))}
        </div>
        <Input
          id="social-ig-collab"
          value={collabDraft}
          disabled={value.collaborators.length >= 3}
          onChange={(event) => setCollabDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              addCollaborator();
            }
          }}
          placeholder={t('social.composer.ig_collaborators_placeholder')}
        />
        <FieldDescription>{t('social.composer.ig_collaborators_hint')}</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="social-ig-location">{t('social.composer.ig_location')}</FieldLabel>
        {value.location ? (
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm">{value.location.name}</p>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={t('social.composer.ig_location_clear')}
              onClick={() => {
                onChange({ ...value, location: null });
                setLocationQuery('');
                setLocationResults([]);
              }}
            >
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              id="social-ig-location"
              value={locationQuery}
              onChange={(event) => setLocationQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  searchLocation();
                }
              }}
              placeholder={t('social.composer.ig_location_placeholder')}
              disabled={!accountId}
            />
            <Button type="button" variant="outline" size="icon" disabled={!accountId || locationBusy} onClick={searchLocation} aria-label={t('social.composer.ig_location_search')}>
              {locationBusy ? <Spinner /> : <HugeiconsIcon icon={Search01Icon} />}
            </Button>
          </div>
        )}
        {locationResults.length > 0 ? (
          <ul className="mt-2 max-h-40 overflow-auto rounded-md border">
            {locationResults.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  className="w-full truncate px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onChange({ ...value, location: place });
                    setLocationQuery(place.name);
                    setLocationResults([]);
                  }}
                >
                  {place.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <FieldDescription>
          {locationUnsupported ? t('social.composer.ig_location_unsupported') : t('social.composer.ig_location_hint')}
        </FieldDescription>
      </Field>

      {hasVideo ? (
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="social-ig-audio">{t('social.composer.ig_audio')}</FieldLabel>
          <Input
            id="social-ig-audio"
            value={value.audioName}
            onChange={(event) => onChange({ ...value, audioName: event.target.value })}
            placeholder={t('social.composer.ig_audio_placeholder')}
          />
          <FieldDescription>{t('social.composer.ig_audio_hint')}</FieldDescription>
        </Field>
      ) : null}
    </div>
  );
}
