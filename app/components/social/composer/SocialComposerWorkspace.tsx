import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  ComputerIcon,
  Delete02Icon,
  HashIcon,
  ImageAdd01Icon,
  InstagramIcon,
  LibraryIcon,
  Linkedin01Icon,
  MagicWand01Icon,
  Scissor01Icon,
  SparklesIcon,
  TwitterIcon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { chat } from '@/lib/ai/client';
import { socialAccountLabel, socialEventCardLabel } from '@/lib/social/socialQueues';
import { useAppStore } from '@/lib/store/useAppStore';
import {
  PROVIDER_CHAR_LIMITS,
  type SocialAccount,
  type SocialCampaign,
  type SocialEventCard,
  type SocialLibraryItem,
  type SocialMediaItem,
  type SocialPost,
  type SocialProvider,
} from '@/components/social/socialTypes';

const PROVIDERS: SocialProvider[] = ['linkedin', 'instagram', 'x'];
const PROVIDER_LABELS: Record<SocialProvider, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  x: 'X',
};
const PROVIDER_ICONS: Record<SocialProvider, IconSvgElement> = {
  linkedin: Linkedin01Icon,
  instagram: InstagramIcon,
  x: TwitterIcon,
};
type AiAction = 'improve' | 'shorten' | 'hashtags' | 'generate';

function toLocalDateTime(timestamp: number | null): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function SocialComposerWorkspace({
  accounts,
  campaigns,
  post,
  initialCampaignId,
  onClose,
  onSaved,
}: {
  accounts: SocialAccount[];
  campaigns: SocialCampaign[];
  post: SocialPost | null;
  initialCampaignId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const projectId = useAppStore((state) => state.currentProject?.id ?? 'default');
  const [providers, setProviders] = useState<SocialProvider[]>(post ? [post.provider] : ['linkedin']);
  const [body, setBody] = useState(post?.body ?? '');
  const [media, setMedia] = useState<SocialMediaItem[]>(post?.media ?? []);
  const [mediaUrl, setMediaUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState(post?.linkUrl ?? '');
  const [topics, setTopics] = useState((post?.topics ?? []).join(', '));
  const [campaignId, setCampaignId] = useState(post?.campaignId ?? initialCampaignId ?? '');
  const [eventCardId, setEventCardId] = useState(post?.eventCardId ?? '');
  const [eventCards, setEventCards] = useState<SocialEventCard[]>([]);
  const [scheduledAt, setScheduledAt] = useState(toLocalDateTime(post?.scheduledAt ?? null));
  const [previewProvider, setPreviewProvider] = useState<SocialProvider>(post?.provider ?? 'linkedin');
  const [accountIds, setAccountIds] = useState<Partial<Record<SocialProvider, string>>>(() => {
    const defaults: Partial<Record<SocialProvider, string>> = {};
    for (const provider of PROVIDERS) {
      defaults[provider] = accounts.find((account) => account.provider === provider && account.status === 'active')?.id;
    }
    if (post?.accountId) defaults[post.provider] = post.accountId;
    return defaults;
  });
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState<AiAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<SocialLibraryItem[] | null>(null);
  const [composerTab, setComposerTab] = useState<'content' | 'media' | 'details'>('content');

  const initialSnapshot = useMemo(
    () => JSON.stringify({ providers, body, media, linkUrl, topics, campaignId, eventCardId, scheduledAt, accountIds }),
    // Initial value is intentionally captured only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const dirty = initialSnapshot !== JSON.stringify({ providers, body, media, linkUrl, topics, campaignId, eventCardId, scheduledAt, accountIds });
  const limit = Math.min(...providers.map((provider) => PROVIDER_CHAR_LIMITS[provider]));
  const selectedEventCard = eventCards.find((card) => card.id === eventCardId);

  useEffect(() => { window.electron.invoke('social:event-cards:list').then((response) => {
      if (response?.success) setEventCards(response.data?.cards ?? []);
    });
  }, []);

  useEffect(() => {
    if (!providers.includes(previewProvider) && providers[0]) setPreviewProvider(providers[0]);
  }, [previewProvider, providers]);

  const requestClose = () => {
    if (dirty) setDiscardOpen(true);
    else onClose();
  };

  const addMediaUrl = () => {
    const value = mediaUrl.trim();
    if (!value) return;
    const type = /\.(mp4|mov|m4v|webm)([?#]|$)/i.test(value) ? 'video' : 'image';
    setMedia((current) => [...current, { type, url: value }]);
    setMediaUrl('');
  };

  const pickMedia = async () => {
    const response = await window.electron.invoke('social:media:pick');
    if (!response?.success) {
      setError(response?.error || 'Error');
      return;
    }
    setMedia((current) => [...current, ...(response.data?.items ?? [])]);
  };

  const openLibrary = async () => {
    setLibraryOpen(true);
    if (library !== null) return;
    const response = await window.electron.invoke('social:media:library', { projectId });
    setLibrary(response?.success ? response.data ?? [] : []);
  };

  const addLibraryItem = (item: SocialLibraryItem) => {
    setMedia((current) => current.some((entry) => entry.resourceId === item.resourceId)
      ? current
      : [...current, { type: item.type, resourceId: item.resourceId, name: item.folderPath ? `${item.folderPath} / ${item.title}` : item.title }]);
    setLibraryOpen(false);
  };

  const runAi = async (action: AiAction) => {
    if (action !== 'generate' && !body.trim()) {
      setError(t('social.composer.ai_need_text'));
      return;
    }
    setAiBusy(action);
    setError(null);
    const instruction = {
      improve: 'Improve the following social copy while preserving its language and message.',
      shorten: `Shorten the following copy to comfortably fit within ${limit} characters.`,
      hashtags: 'Return only 3 to 6 relevant hashtags for the following social copy.',
      generate: 'Write polished social copy from the following brief.',
    }[action];
    try {
      const result = await chat([
        {
          role: 'system',
          content: `You are a social editor. Return only final copy. Channels: ${providers.join(', ')}. Maximum ${limit} characters.`,
        },
        {
          role: 'user',
          content: `${instruction}\n\n${body || topics || linkUrl || t('social.composer.ai_need_brief')}`,
        },
      ]);
      const clean = result.trim().replace(/^["'`]+|["'`]+$/g, '');
      setBody((current) => action === 'hashtags' && current ? `${current.trimEnd()}\n\n${clean}` : clean);
    } catch (reason) {
      setError(t('social.composer.ai_error', { error: reason instanceof Error ? reason.message : String(reason) }));
    } finally {
      setAiBusy(null);
    }
  };

  const save = async () => {
    setError(null);
    if (!providers.length) return setError(t('social.composer.error_no_provider'));
    if (!body.trim() && !media.length) return setError(t('social.composer.error_empty'));
    if (body.length > limit) return setError(t('social.composer.error_too_long', { limit }));
    if (providers.includes('instagram') && !media.length) return setError(t('social.composer.error_instagram_media'));
    if (providers.some((provider) => !accountIds[provider])) {
      return setError(t('social.studio.composer.account_required'));
    }

    setSaving(true);
    const shared = {
      body,
      media,
      linkUrl: linkUrl.trim() || null,
      topics: topics.split(',').map((topic) => topic.trim()).filter(Boolean),
      campaignId: campaignId || null,
      campaign: null,
      eventCardId: eventCardId || null,
      eventCardPublicUrl: selectedEventCard?.publicUrl || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt).getTime() : null,
    };
    try {
      if (post) {
        const response = await window.electron.invoke('social:posts:update', {
          postId: post.id,
          patch: { ...shared, accountId: accountIds[post.provider] },
        });
        if (!response?.success) throw new Error(response?.error || 'Error');
      } else {
        const groupId = providers.length > 1 ? `spg-${Date.now().toString(36)}` : null;
        for (const provider of providers) {
          const response = await window.electron.invoke('social:posts:create', {
            ...shared,
            provider,
            accountId: accountIds[provider] ?? null,
            groupId,
          });
          if (!response?.success) throw new Error(response?.error || 'Error');
        }
      }
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="social-studio flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">
            {post ? t('social.composer.edit_title') : t('social.composer.title')}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={requestClose}>
            {t('social.composer.cancel')}
          </Button>
          <Button type="button" onClick={() => save()} disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {scheduledAt ? t('social.composer.save_scheduled') : t('social.composer.save_draft')}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 overflow-auto xl:grid-cols-[minmax(0,1fr)_24rem]">
        <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 lg:p-6">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <FieldSet>
            <FieldLegend>{t('social.studio.composer.destinations')}</FieldLegend>
            <ToggleGroup
              value={providers}
              onValueChange={(value) => { if (!post) setProviders(value as SocialProvider[]); }}
              variant="outline"
              className="flex-wrap"
            >
              {PROVIDERS.map((provider) => (
                <ToggleGroupItem key={provider} value={provider} disabled={Boolean(post && post.provider !== provider)}>
                  <HugeiconsIcon icon={PROVIDER_ICONS[provider]} data-icon="inline-start" />
                  {PROVIDER_LABELS[provider]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {providers.map((provider) => {
                const providerAccounts = accounts.filter((account) => account.provider === provider && account.status === 'active');
                const selectedAccount = providerAccounts.find((account) => account.id === accountIds[provider]);
                return (
                  <Field key={provider} data-invalid={!accountIds[provider]}>
                    <FieldLabel>{PROVIDER_LABELS[provider]}</FieldLabel>
                    <Select value={accountIds[provider] ?? ''} onValueChange={(value) => setAccountIds((current) => ({ ...current, [provider]: value ?? '' }))}>
                      <SelectTrigger className="w-full" aria-invalid={!accountIds[provider]}>
                        <SelectValue>
                          {selectedAccount
                            ? socialAccountLabel(selectedAccount)
                            : t('social.studio.composer.choose_account')}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent><SelectGroup>
                        {providerAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{socialAccountLabel(account)}</SelectItem>)}
                      </SelectGroup></SelectContent>
                    </Select>
                  </Field>
                );
              })}
            </div>
          </FieldSet>

          <Card>
            <Tabs
              value={composerTab}
              onValueChange={(value) => {
                if (value === 'content' || value === 'media' || value === 'details') setComposerTab(value);
              }}
              className="gap-0"
            >
              <CardHeader className="gap-4 border-b pb-4">
                <TabsList variant="line" className="w-full justify-start">
                  <TabsTrigger value="content">{t('social.composer.section_content')}</TabsTrigger>
                  <TabsTrigger value="media" className="gap-1.5">
                    {t('social.composer.section_media')}
                    {media.length > 0 ? (
                      <Badge variant="secondary" className="tabular-nums">{media.length}</Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="details">{t('social.composer.section_details')}</TabsTrigger>
                </TabsList>
                {composerTab === 'content' ? (
                  <CardDescription>{t('social.studio.composer.content_description')}</CardDescription>
                ) : null}
                {composerTab === 'media' ? (
                  <CardDescription>{t('social.studio.composer.media_description')}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="pt-5">
                <TabsContent value="content" className="mt-0">
                  <FieldGroup>
                    <Field data-invalid={body.length > limit}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <FieldLabel htmlFor="social-studio-copy">{t('social.studio.composer.copy')}</FieldLabel>
                        <div className="flex flex-wrap gap-1">
                          {([
                            ['improve', SparklesIcon, t('social.composer.ai_improve')],
                            ['shorten', Scissor01Icon, t('social.composer.ai_shorten')],
                            ['hashtags', HashIcon, t('social.composer.ai_hashtags')],
                            ['generate', MagicWand01Icon, t('social.composer.ai_generate')],
                          ] as const).map(([action, icon, label]) => (
                            <Button key={action} type="button" size="xs" variant="ghost" onClick={() => runAi(action)} disabled={aiBusy !== null}>
                              {aiBusy === action ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={icon} data-icon="inline-start" />}
                              {label}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <Textarea id="social-studio-copy" value={body} onChange={(event) => setBody(event.target.value)} rows={12} aria-invalid={body.length > limit} placeholder={t('social.composer.body_placeholder')} />
                      <FieldDescription className={body.length > limit ? 'text-destructive' : undefined}>{body.length} / {limit}</FieldDescription>
                    </Field>
                  </FieldGroup>
                </TabsContent>

                <TabsContent value="media" className="mt-0">
                  <FieldGroup>
                    <Field>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => pickMedia()}>
                          <HugeiconsIcon icon={ComputerIcon} data-icon="inline-start" />
                          {t('social.composer.media_from_computer')}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => openLibrary()}>
                          <HugeiconsIcon icon={LibraryIcon} data-icon="inline-start" />
                          {t('social.composer.media_from_library')}
                        </Button>
                        <div className="flex min-w-64 flex-1 gap-2">
                          <Input value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder={t('social.composer.media_placeholder')} />
                          <Button type="button" variant="outline" onClick={addMediaUrl}>
                            <HugeiconsIcon icon={ImageAdd01Icon} />
                            <span className="sr-only">{t('social.composer.add_media')}</span>
                          </Button>
                        </div>
                      </div>
                    </Field>
                    {media.map((item, index) => (
                      <div key={`${item.url ?? item.path ?? item.resourceId}-${index}`} className="flex items-center gap-3 rounded-xl bg-muted p-3">
                        <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-background">
                          {item.url && item.type !== 'video' ? <img src={item.url} alt="" className="size-full object-cover" /> : null}
                        </div>
                        <span className="min-w-0 flex-1 truncate text-sm">{item.name || item.url || item.path || t('social.composer.media_from_library')}</span>
                        <Button type="button" size="icon-sm" variant="ghost" onClick={() => setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                          <HugeiconsIcon icon={Delete02Icon} />
                          <span className="sr-only">{t('common.delete')}</span>
                        </Button>
                      </div>
                    ))}
                  </FieldGroup>
                </TabsContent>

                <TabsContent value="details" className="mt-0">
                  <FieldGroup>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="social-studio-link">{t('social.composer.link_placeholder')}</FieldLabel>
                        <Input id="social-studio-link" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="social-studio-topics">{t('social.composer.topics_placeholder')}</FieldLabel>
                        <Input id="social-studio-topics" value={topics} onChange={(event) => setTopics(event.target.value)} />
                      </Field>
                      <Field>
                        <FieldLabel>{t('social.agent_stat_campaigns')}</FieldLabel>
                        <Select
                          value={campaignId || '__none__'}
                          onValueChange={(value) => setCampaignId(value === '__none__' ? '' : value ?? '')}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue>
                              {campaigns.find((campaign) => campaign.id === campaignId)?.name?.trim()
                                || t('social.composer.campaign_none')}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="__none__">{t('social.composer.campaign_none')}</SelectItem>
                              {campaigns
                                .filter((campaign) => campaign.status === 'active')
                                .map((campaign) => (
                                  <SelectItem key={campaign.id} value={campaign.id}>
                                    {campaign.name}
                                  </SelectItem>
                                ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel>{t('social.events.cards')}</FieldLabel>
                        <Select
                          value={eventCardId || '__none__'}
                          onValueChange={(value) => setEventCardId(value === '__none__' ? '' : value ?? '')}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue>
                              {selectedEventCard
                                ? socialEventCardLabel(selectedEventCard)
                                : t('social.events.no_card')}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="__none__">{t('social.events.no_card')}</SelectItem>
                              {eventCards
                                .filter((card) => card.status === 'published')
                                .map((card) => (
                                  <SelectItem key={card.id} value={card.id}>
                                    {socialEventCardLabel(card)}
                                  </SelectItem>
                                ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="social-studio-schedule">{t('social.composer.section_schedule')}</FieldLabel>
                        <Input id="social-studio-schedule" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
                      </Field>
                    </div>
                  </FieldGroup>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </main>

        <aside className="sticky top-0 hidden h-fit border-l bg-muted/30 p-6 xl:block">
          <p className="mb-4 text-xs font-medium text-muted-foreground">{t('social.preview.title')}</p>
          <ToggleGroup value={[previewProvider]} onValueChange={(value) => { if (value[0]) setPreviewProvider(value[0] as SocialProvider); }} variant="outline" size="sm" className="mb-4">
            {providers.map((provider) => <ToggleGroupItem key={provider} value={provider}><HugeiconsIcon icon={PROVIDER_ICONS[provider]} /><span className="sr-only">{PROVIDER_LABELS[provider]}</span></ToggleGroupItem>)}
          </ToggleGroup>
          <PostPreview provider={previewProvider} account={accounts.find((account) => account.id === accountIds[previewProvider])} body={body} media={media} linkUrl={linkUrl} />
        </aside>
      </div>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('social.studio.composer.discard_title')}</DialogTitle>
            <DialogDescription>{t('social.studio.composer.discard_description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDiscardOpen(false)}>{t('common.cancel')}</Button>
            <Button type="button" variant="destructive" onClick={onClose}>{t('social.studio.composer.discard')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="max-h-[min(680px,calc(100vh-2rem))] overflow-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('social.composer.media_from_library')}</DialogTitle>
            <DialogDescription>{t('social.studio.composer.library_description')}</DialogDescription>
          </DialogHeader>
          {library === null ? (
            <div className="flex min-h-40 items-center justify-center"><Spinner /></div>
          ) : library.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {library.map((item) => (
                <Button key={item.resourceId} type="button" variant="outline" className="h-auto min-w-0 justify-start rounded-xl p-3 text-left" onClick={() => addLibraryItem(item)}>
                  <HugeiconsIcon icon={item.type === 'video' ? LibraryIcon : ImageAdd01Icon} data-icon="inline-start" />
                  <span className="min-w-0"><span className="block truncate">{item.title}</span><span className="block truncate text-xs text-muted-foreground">{item.folderPath || item.type}</span></span>
                </Button>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('social.composer.library_empty')}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PostPreview({ provider, account, body, media, linkUrl }: { provider: SocialProvider; account?: SocialAccount; body: string; media: SocialMediaItem[]; linkUrl: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <HugeiconsIcon icon={PROVIDER_ICONS[provider]} />
          </div>
          <div className="min-w-0">
            <CardTitle className="truncate">{account ? socialAccountLabel(account) : PROVIDER_LABELS[provider]}</CardTitle>
            <CardDescription>{PROVIDER_LABELS[provider]} · now</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{body || '…'}</p>
        {media[0]?.url ? (
          media[0].type === 'video' ? <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">Video · {media[0].name || media[0].url}</div> : <img src={media[0].url} alt="" className="aspect-video w-full rounded-xl bg-muted object-cover" />
        ) : media.length ? <div className="flex aspect-video items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">{media.length} media</div> : null}
        {linkUrl ? <Badge variant="outline" className="max-w-full truncate">{linkUrl}</Badge> : null}
        <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Like</span><span>Comment</span><span>Share</span></div>
      </CardContent>
    </Card>
  );
}
