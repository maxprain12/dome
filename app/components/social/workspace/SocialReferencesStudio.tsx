import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlusSignIcon, Settings02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SocialAccountAvatar } from '@/components/social/cards/SocialAccountAvatar';
import { PROVIDER_LABELS } from '@/components/social/crm/socialCrmChrome';
import {
  SocialDirectoryColumn,
  SocialFichaEmpty,
  SocialHubSplit,
} from '@/components/social/workspace/SocialDirectoryColumn';
import { SocialCreatorPick } from '@/components/social/workspace/SocialCreatorPick';
import { SocialCreatorProfilePane } from '@/components/social/workspace/SocialCreatorProfilePane';
import { coversFromPosts } from '@/components/social/workspace/socialCoverSrc';
import { useAppStore } from '@/lib/store/useAppStore';
import { askStudioMany } from '@/components/studio-hub/askStudioMany';
import { looksLikeOpaqueId } from '@/lib/social/socialQueues';
import { formatSocialProfilePinLabel } from '@/lib/chat/pinLabels';
import { showToast } from '@/lib/store/useToastStore';

export type SocialReferenceRecord = {
  id: string;
  provider: 'linkedin' | 'instagram' | 'x';
  url: string;
  title: string;
  body?: string | null;
  format?: string | null;
  topics?: string[];
  media?: Array<{ type?: 'image' | 'video' | 'reel'; url?: string; thumbnailUrl?: string }>;
  metrics?: Record<string, number | null> | null;
  sourceKind?: string;
  limitations?: string[];
  notes?: string | null;
  author?: { name?: string; handle?: string | null; avatarUrl?: string | null };
  kind?: 'profile' | 'post';
  followers?: number | null;
  following?: number | null;
  postsCount?: number | null;
  capturedAt?: number | null;
  publishedAt?: number | null;
};

export type SocialWatchlistRecord = {
  id: string;
  name: string;
  kind: 'competitor' | 'inspiration' | 'following' | 'custom';
  members: Array<{
    personId: string;
    displayName?: string | null;
    handle?: string | null;
    provider?: string | null;
    profileUrl?: string | null;
    avatarUrl?: string | null;
  }>;
};

type CreatorSuggestion = {
  id: string;
  provider: 'linkedin' | 'instagram' | 'x';
  handle?: string | null;
  displayName?: string | null;
  profileUrl?: string | null;
  avatarUrl?: string | null;
  reason: string;
  reasonDetail?: string | null;
};

type ExplorationRecord = {
  id: string;
  recipeId: string;
  status: 'queued' | 'running' | 'ready' | 'limited' | 'failed' | 'cancelled';
  summary?: string | null;
  createdAt: number;
};

type RecipeId = 'hooks' | 'formats' | 'rhythm' | 'this_week';
type RecipeCadence = 'manual' | 'daily' | 'weekly';
type RecipeConfig = { id: RecipeId; enabled: boolean; cadence: RecipeCadence };
type RecipesByView = Partial<Record<'inspiration' | 'competitor' | 'following', RecipeConfig[]>>;

export type SocialCreatorFocus = {
  personId?: string | null;
  handle?: string | null;
  url?: string | null;
};

const VIEW_KINDS: Array<'inspiration' | 'competitor' | 'following'> = ['inspiration', 'competitor', 'following'];
const CADENCES: RecipeCadence[] = ['manual', 'daily', 'weekly'];

function asCadence(value: string): RecipeCadence {
  return CADENCES.includes(value as RecipeCadence) ? (value as RecipeCadence) : 'weekly';
}

function watchlistLabel(kind: SocialWatchlistRecord['kind'], t: (key: string) => string): string {
  switch (kind) {
    case 'competitor':
      return t('social.watchlists.competitor');
    case 'inspiration':
      return t('social.watchlists.inspiration');
    case 'following':
      return t('social.watchlists.following');
    case 'custom':
      return t('social.watchlists.custom');
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function creatorLabel(
  member: { displayName?: string | null; handle?: string | null },
  fallback: string,
): string {
  const name = member.displayName || (member.handle ? `@${member.handle.replace(/^@/, '')}` : '');
  if (!name || looksLikeOpaqueId(name)) return fallback;
  return name;
}

function matchesCreator(item: SocialReferenceRecord, member: SocialWatchlistRecord['members'][number]): boolean {
  const handle = String(member.handle || '').replace(/^@/, '').toLowerCase();
  const itemHandle = String(item.author?.handle || '').replace(/^@/, '').toLowerCase();
  if (handle && itemHandle && handle === itemHandle) return true;
  if (member.profileUrl && item.url && (item.url === member.profileUrl || item.url.startsWith(member.profileUrl))) {
    return true;
  }
  return false;
}

function creatorAvatarSrc(
  member: SocialWatchlistRecord['members'][number],
  references: SocialReferenceRecord[],
): string | null {
  if (member.avatarUrl) return member.avatarUrl;
  const ranked = references.filter((item) => matchesCreator(item, member) && item.author?.avatarUrl);
  const profile = ranked.find((item) => item.kind === 'profile' || item.format === 'profile');
  return profile?.author?.avatarUrl || ranked[0]?.author?.avatarUrl || null;
}

function creatorPosts(
  member: SocialWatchlistRecord['members'][number],
  references: SocialReferenceRecord[],
): SocialReferenceRecord[] {
  return references.filter((item) => matchesCreator(item, member) && item.kind !== 'profile');
}

function defaultRecipe(kind: SocialWatchlistRecord['kind']): 'hooks' | 'formats' | 'rhythm' | 'this_week' {
  if (kind === 'following') return 'this_week';
  if (kind === 'inspiration') return 'formats';
  return 'hooks';
}

export function SocialReferencesStudio({
  onPlanPost,
  focusCreator = null,
}: {
  onPlanPost?: (seed: { body?: string; topics?: string[] }) => void;
  focusCreator?: SocialCreatorFocus | null;
} = {}) {
  const { t } = useTranslation();
  const projectId = useAppStore((state) => state.currentProject?.id ?? 'default');
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [references, setReferences] = useState<SocialReferenceRecord[]>([]);
  const [watchlists, setWatchlists] = useState<SocialWatchlistRecord[]>([]);
  const [suggestions, setSuggestions] = useState<CreatorSuggestion[]>([]);
  const [explorations, setExplorations] = useState<ExplorationRecord[]>([]);
  const [recipes, setRecipes] = useState<RecipesByView>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exploring, setExploring] = useState(false);
  const [viewKind, setViewKind] = useState<'inspiration' | 'competitor' | 'following'>('inspiration');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const activeList = watchlists.find((list) => list.kind === viewKind) || null;
  const members = useMemo(() => activeList?.members ?? [], [activeList]);

  const load = useCallback(async () => {
    const [refs, lists, suggested, recipeRes] = await Promise.all([
      window.electron.invoke('social:references:list', { projectId, limit: 120 }),
      window.electron.invoke('social:watchlists:list', { projectId }),
      window.electron.invoke('social:suggestions:list', { projectId }),
      window.electron.invoke('social:explorations:recipes'),
    ]);
    if (refs?.success) setReferences(Array.isArray(refs.data) ? refs.data : []);
    if (lists?.success) setWatchlists(Array.isArray(lists.data) ? lists.data : []);
    if (suggested?.success) setSuggestions(Array.isArray(suggested.data) ? suggested.data : []);
    if (recipeRes?.success && recipeRes.data && typeof recipeRes.data === 'object') {
      setRecipes(recipeRes.data as RecipesByView);
    }
    setError(refs?.error || lists?.error || suggested?.error || recipeRes?.error || null);
  }, [projectId]);

  useEffect(() => {
    load().catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'Error');
    });
    window.electron.invoke('social:suggestions:refresh', { projectId }).then((res) => {
      if (res?.success && Array.isArray(res.data)) setSuggestions(res.data);
    }).catch(() => {});
    const unsub = window.electron?.on?.('social:explorations-updated', () => {
      load().catch(() => {});
    });
    return () => unsub?.();
  }, [load, projectId]);

  useEffect(() => {
    if (!focusCreator) return;
    const handle = String(focusCreator.handle || '').replace(/^@/, '').toLowerCase();
    const urlNeedle = String(focusCreator.url || '');
    for (const list of watchlists) {
      const member = list.members.find((item) => {
        if (focusCreator.personId && item.personId === focusCreator.personId) return true;
        const itemHandle = String(item.handle || '').replace(/^@/, '').toLowerCase();
        if (handle && itemHandle && handle === itemHandle) return true;
        if (urlNeedle && item.profileUrl && (item.profileUrl === urlNeedle || urlNeedle.startsWith(item.profileUrl))) {
          return true;
        }
        return false;
      });
      if (!member) continue;
      if (list.kind === 'inspiration' || list.kind === 'competitor' || list.kind === 'following') {
        setViewKind(list.kind);
      }
      setSelectedPersonId(member.personId);
      return;
    }
  }, [focusCreator, watchlists]);

  const filteredMembers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member) => {
      const haystack = [member.displayName, member.handle, member.profileUrl]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [members, query]);

  useEffect(() => {
    if (selectedPersonId) return;
    const first = filteredMembers[0];
    if (first) setSelectedPersonId(first.personId);
  }, [filteredMembers, selectedPersonId]);

  const selected = members.find((member) => member.personId === selectedPersonId) || null;

  useEffect(() => {
    if (!selected?.personId) {
      setExplorations([]);
      return;
    }
    window.electron.invoke('social:explorations:list', { projectId, personId: selected.personId, limit: 12 })
      .then((res) => {
        if (res?.success) setExplorations(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {});
  }, [projectId, selected?.personId]);

  const evidence = useMemo(() => {
    if (!selected) return [];
    return references.filter((item) => matchesCreator(item, selected));
  }, [references, selected]);

  const profileEvidence = evidence.find((item) => item.kind === 'profile') || null;
  const postEvidence = evidence.filter((item) => item.kind !== 'profile');

  const pinCreator = (member: SocialWatchlistRecord['members'][number], promptKey: string) => {
    askStudioMany(
      t(promptKey),
      {
        id: profileEvidence?.id || member.personId,
        title: formatSocialProfilePinLabel({
          name: member.displayName,
          handle: member.handle,
          provider: member.provider,
        }),
        type: 'social_profile',
        kind: 'social_profile',
        meta: {
          url: member.profileUrl,
          provider: member.provider,
          handle: member.handle,
          name: member.displayName,
          avatarUrl: member.avatarUrl || profileEvidence?.author?.avatarUrl,
        },
      },
      'dome-social-insights',
    );
  };

  const capture = async () => {
    if (!url.trim() || !activeList) return;
    setSaving(true);
    try {
      const res = await window.electron.invoke('social:references:capture', { projectId, url: url.trim() });
      if (!res?.success) throw new Error(res?.error || t('social.references.capture_error'));
      const data = res.data as { reference?: SocialReferenceRecord; recentPosts?: SocialReferenceRecord[] };
      const captured = data?.reference;
      if (captured) {
        const added = await window.electron.invoke('social:watchlists:add-member', {
          watchlistId: activeList.id,
          handle: captured.author?.handle || undefined,
          provider: captured.provider,
          profileUrl: captured.kind === 'profile' ? captured.url : undefined,
          avatarUrl: captured.author?.avatarUrl || undefined,
          displayName: captured.author?.name || captured.title,
        });
        if (!added?.success) throw new Error(added?.error || t('social.references.capture_error'));
        const members = (added.data as SocialWatchlistRecord | undefined)?.members || [];
        const nextMember = members.find((item) => {
          const handle = String(captured.author?.handle || '').replace(/^@/, '').toLowerCase();
          const itemHandle = String(item.handle || '').replace(/^@/, '').toLowerCase();
          if (handle && itemHandle && handle === itemHandle) return true;
          return Boolean(captured.url && item.profileUrl === captured.url);
        }) || members[0];
        if (nextMember?.personId) setSelectedPersonId(nextMember.personId);
      }
      setUrl('');
      await load();
      const extra = data?.recentPosts?.length ?? 0;
      if (extra > 0) showToast('success', t('social.insights.public_posts', { count: extra }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('social.references.capture_error'));
    } finally {
      setSaving(false);
    }
  };

  const exploreNow = async () => {
    if (!selected) return;
    setExploring(true);
    try {
      const res = await window.electron.invoke('social:explorations:run', {
        projectId,
        personId: selected.personId,
        recipeId: defaultRecipe(viewKind),
        watchlistKind: viewKind,
      });
      if (!res?.success) throw new Error(res?.error || t('social.references.capture_error'));
      showToast('success', t('social.creators.explore_queued'));
      await load();
      const listed = await window.electron.invoke('social:explorations:list', {
        projectId,
        personId: selected.personId,
        limit: 12,
      });
      if (listed?.success) setExplorations(Array.isArray(listed.data) ? listed.data : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('social.references.capture_error'));
    } finally {
      setExploring(false);
    }
  };

  const acceptSuggestion = async (suggestion: CreatorSuggestion) => {
    const res = await window.electron.invoke('social:suggestions:accept', {
      suggestionId: suggestion.id,
      watchlistKind: viewKind,
      projectId,
    });
    if (!res?.success) {
      showToast('error', res?.error || t('social.references.capture_error'));
      return;
    }
    const member = (res.data as { member?: SocialWatchlistRecord['members'][number] } | null)?.member;
    await load();
    if (member?.personId) setSelectedPersonId(member.personId);
    showToast('success', t('social.insights.added_watchlist', { list: watchlistLabel(viewKind, t) }));
  };

  const removeMember = async (personId: string) => {
    if (!activeList) return;
    await window.electron.invoke('social:watchlists:remove-member', {
      watchlistId: activeList.id,
      personId,
    });
    if (selectedPersonId === personId) setSelectedPersonId(null);
    await load();
  };

  const planFromEvidence = (item: { topics?: string[]; body?: string | null }) => {
    const topics = (item.topics || []).slice(0, 6);
    const hook = String(item.body || '').trim().split('\n')[0]?.slice(0, 180);
    onPlanPost?.({
      body: hook ? `${hook}\n` : '',
      topics,
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <ToggleGroup
          value={[viewKind]}
          variant="outline"
          size="sm"
          aria-label={t('social.watchlists.title')}
          onValueChange={(values) => {
            const next = values[0];
            if (next === 'inspiration' || next === 'competitor' || next === 'following') {
              setViewKind(next);
              setSelectedPersonId(null);
            }
          }}
        >
          {VIEW_KINDS.map((kind) => {
            const count = watchlists.find((list) => list.kind === kind)?.members.length ?? 0;
            return (
              <ToggleGroupItem key={kind} value={kind}>
                {watchlistLabel(kind, t)}
                {count > 0 ? <span className="tabular-nums text-muted-foreground">{count}</span> : null}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            capture().catch(() => {});
          }}
        >
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t('social.creators.add_placeholder')}
            aria-label={t('social.creators.add_placeholder')}
          />
          <Button type="submit" size="sm" disabled={saving || !url.trim()}>
            <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
            {t('social.creators.add')}
          </Button>
        </form>
      </div>

      {suggestions.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto border-b px-4 py-2">
          <p className="shrink-0 self-center text-[11px] font-medium text-muted-foreground">
            {t('social.creators.suggestions')}
          </p>
          {suggestions.map((suggestion) => (
            <div key={suggestion.id} className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card py-1 pr-1 pl-1.5">
              <SocialAccountAvatar
                name={suggestion.displayName || suggestion.handle || suggestion.provider}
                src={suggestion.avatarUrl}
                size="sm"
              />
              <span className="max-w-28 truncate text-xs font-medium">
                {creatorLabel(suggestion, t('social.creators.unknown_creator'))}
              </span>
              <Button type="button" size="xs" variant="ghost" onClick={() => { acceptSuggestion(suggestion).catch(() => {}); }}>
                {t('social.creators.accept_short')}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => {
                  window.electron.invoke('social:suggestions:dismiss', { suggestionId: suggestion.id })
                    .then(() => load())
                    .catch(() => {});
                }}
              >
                {t('social.creators.dismiss')}
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="px-6 py-2 text-sm text-destructive">{error}</p> : null}

      <SocialHubSplit>
        <div className="flex h-full min-h-0 w-[21rem] shrink-0 flex-col border-r">
        <SocialDirectoryColumn
          query={members.length > 0 ? query : undefined}
          onQueryChange={members.length > 0 ? setQuery : undefined}
          queryPlaceholder={t('social.creators.search')}
          action={members.length > 0 ? (
            <Popover>
              <PopoverTrigger
                render={
                  <Button type="button" size="icon-xs" variant="outline" aria-label={t('social.creators.recipes_toggle')} />
                }
              >
                <HugeiconsIcon icon={Settings02Icon} />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 gap-2 p-3">
                <p className="text-[11px] font-medium text-muted-foreground">{t('social.creators.recipes')}</p>
                {(recipes[viewKind] || []).map((recipe) => {
                  const cadenceItems = CADENCES.map((cadence) => ({
                    value: cadence,
                    label: t(`social.creators.cadence_${cadence}`),
                  }));
                  const cadenceLabel = cadenceItems.find((item) => item.value === recipe.cadence)?.label
                    || t('social.creators.cadence_weekly');
                  return (
                    <div key={recipe.id} className="flex items-center gap-2">
                      <Switch
                        checked={recipe.enabled}
                        onCheckedChange={(enabled) => {
                          const next = {
                            ...recipes,
                            [viewKind]: (recipes[viewKind] || []).map((item) =>
                              item.id === recipe.id ? { ...item, enabled } : item,
                            ),
                          };
                          setRecipes(next);
                          window.electron.invoke('social:explorations:recipes:set', next).catch(() => {});
                        }}
                        aria-label={t(`social.creators.recipe_${recipe.id}`)}
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px]">
                        {t(`social.creators.recipe_${recipe.id}`)}
                      </span>
                      <Select
                        value={recipe.cadence}
                        onValueChange={(nextCadence) => {
                          if (!nextCadence) return;
                          const next = {
                            ...recipes,
                            [viewKind]: (recipes[viewKind] || []).map((item) =>
                              item.id === recipe.id ? { ...item, cadence: asCadence(nextCadence) } : item,
                            ),
                          };
                          setRecipes(next);
                          window.electron.invoke('social:explorations:recipes:set', next).catch(() => {});
                        }}
                        items={cadenceItems}
                      >
                        <SelectTrigger size="sm" className="h-6 w-24 shrink-0" aria-label={t('social.creators.cadence_weekly')}>
                          <SelectValue>{cadenceLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {cadenceItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </PopoverContent>
            </Popover>
          ) : undefined}
          empty={filteredMembers.length === 0 ? {
            title: t('social.creators.empty_title'),
            description: suggestions.length > 0
              ? t('social.creators.empty_with_suggestions')
              : t('social.creators.empty_description'),
          } : undefined}
        >
          {filteredMembers.length > 0 ? (
            <ul>
              {filteredMembers.map((member) => {
                const posts = creatorPosts(member, references);
                const name = creatorLabel(member, t('social.creators.unknown_creator'));
                return (
                  <SocialCreatorPick
                    key={member.personId}
                    selected={selected?.personId === member.personId}
                    onClick={() => setSelectedPersonId(member.personId)}
                    name={name}
                    handle={member.handle ? `@${String(member.handle).replace(/^@/, '')}` : null}
                    provider={member.provider ? PROVIDER_LABELS[member.provider as keyof typeof PROVIDER_LABELS] : null}
                    avatarUrl={creatorAvatarSrc(member, references)}
                    covers={coversFromPosts(posts)}
                    meta={posts.length > 0 ? t('social.creators.posts_count', { count: posts.length }) : null}
                  />
                );
              })}
            </ul>
          ) : null}
        </SocialDirectoryColumn>
        </div>
        {selected ? (
          <SocialCreatorProfilePane
            member={{
              ...selected,
              avatarUrl: creatorAvatarSrc(selected, references),
            }}
            listLabel={watchlistLabel(viewKind, t)}
            profile={profileEvidence}
            posts={postEvidence}
            exploring={exploring}
            onExplore={() => { exploreNow().catch(() => {}); }}
            onUseInMany={() => pinCreator(selected, 'social.prompts.analyze_profile_text')}
            onRemove={() => { removeMember(selected.personId).catch(() => {}); }}
            onPlanPost={planFromEvidence}
          />
        ) : (
          <SocialFichaEmpty
            title={t('social.creators.empty_title')}
            description={t('social.creators.pick_creator')}
          />
        )}
      </SocialHubSplit>
    </div>
  );
}
