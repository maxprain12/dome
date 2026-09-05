import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Archive02Icon,
  Calendar03Icon,
  Copy01Icon,
  MagicWand01Icon,
  Megaphone02Icon,
  PencilEdit02Icon,
  PlusSignIcon,
  QrCodeIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { useTabStore } from '@/lib/store/useTabStore';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
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
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { socialAccountLabel, socialEventCardLabel, socialPostLabel } from '@/lib/social/socialQueues';
import type {
  SocialAccount,
  SocialDmRule,
  SocialEventCard,
  SocialEventUpdate,
  SocialPost,
} from '@/components/social/socialTypes';
import { HubDetailPane } from '@/components/shared/HubDetailPane';
import { ActionIcon, ReadField, SectionCard } from '@/components/social/crm/socialCrmChrome';
import {
  SocialDirectoryColumn,
  SocialDirectoryRow,
  SocialFichaEmpty,
  SocialHubSplit,
} from '@/components/social/workspace/SocialDirectoryColumn';

export function SocialEventsStudio({
  accounts,
  posts,
  onEdit,
}: {
  accounts: SocialAccount[];
  posts: SocialPost[];
  onEdit: (card: SocialEventCard | null) => void;
}) {
  const { t } = useTranslation();
  const [cards, setCards] = useState<SocialEventCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await window.electron.invoke('social:event-cards:list');
    if (response?.success) {
      setCards(response.data?.cards ?? []);
      setError(null);
    } else {
      setError(response?.error || 'Error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch(() => {});
    const unsubscribe = window.electron?.on?.('social:event-cards-refresh', (payload: { cards?: SocialEventCard[] }) => {
      setCards(payload?.cards ?? []);
      setLoading(false);
    });
    return () => unsubscribe?.();
  }, [load]);

  const selected = cards.find((card) => card.id === selectedId) ?? null;

  return (
    <SocialHubSplit>
      <SocialDirectoryColumn
        title={t('social.studio.nav.events')}
        action={
          <Button type="button" size="sm" onClick={() => onEdit(null)}>
            <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
            {t('social.events.create')}
          </Button>
        }
        loading={loading}
        loadingLabel={t('common.loading')}
        empty={
          !loading && cards.length === 0
            ? {
                icon: <HugeiconsIcon icon={Calendar03Icon} className="size-8" />,
                title: t('social.events.empty'),
                description: t('social.events.empty_description'),
              }
            : undefined
        }
      >
        <ul className="flex flex-col">
          {cards.map((card) => (
            <SocialDirectoryRow
              key={card.id}
              selected={selectedId === card.id}
              onClick={() => setSelectedId(card.id)}
              title={socialEventCardLabel(card)}
              subtitle={[
                new Date(card.startsAt).toLocaleDateString(),
                card.venueName || card.timezone,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
        </ul>
      </SocialDirectoryColumn>
      {error ? (
        <div className="flex flex-1 items-center justify-center p-3">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      ) : selected ? (
        <EventFicha
          card={selected}
          cards={cards}
          accounts={accounts}
          posts={posts}
          onEdit={() => onEdit(selected)}
          onReload={load}
        />
      ) : (
        <SocialFichaEmpty
          icon={<HugeiconsIcon icon={Calendar03Icon} className="size-8" />}
          title={t('social.studio.crm.detail_empty_event')}
          description={t('social.studio.crm.detail_empty_event_hint')}
        />
      )}
    </SocialHubSplit>
  );
}

function EventFicha({
  card,
  cards,
  accounts,
  posts,
  onEdit,
  onReload,
}: {
  card: SocialEventCard;
  cards: SocialEventCard[];
  accounts: SocialAccount[];
  posts: SocialPost[];
  onEdit: () => void;
  onReload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const unavailable = t('social.studio.crm.unavailable');
  const run = async (channel: string, payload: unknown) => {
    const response = await window.electron.invoke(channel, payload);
    if (!response?.success) toast.error(response?.error || 'Error');
    else await onReload();
  };
  const exportCard = async (format: 'url' | 'qr-png' | 'pdf') => {
    const response = await window.electron.invoke('social:event-cards:export', { cardId: card.id, format });
    if (!response?.success) return toast.error(response?.error || 'Error');
    if (format === 'url' && response.data?.content) {
      await navigator.clipboard.writeText(response.data.content);
      toast.success(t('social.events.copied'));
    } else if (!response.data?.cancelled) toast.success(t('social.events.exported'));
  };
  return (
    <HubDetailPane
      icon={
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <HugeiconsIcon icon={Calendar03Icon} />
        </div>
      }
      title={socialEventCardLabel(card)}
      badge={
        <Badge variant={card.status === 'published' ? 'lime' : 'outline'}>
          {t(`social.events.status_${card.status}`)}
        </Badge>
      }
      subtitle={
        <p className="max-w-full truncate text-xs text-muted-foreground">
          {new Date(card.startsAt).toLocaleString()}
          {card.venueName ? `, ${card.venueName}` : ''}
        </p>
      }
      toolbar={
        <div className="flex items-center gap-1.5">
          <ActionIcon
            label={t('common.edit')}
            available
            unavailableLabel={unavailable}
            icon={PencilEdit02Icon}
            onClick={onEdit}
          />
          <ActionIcon
            label={card.status !== 'published' ? t('social.events.publish') : t('social.events.copy_url')}
            available
            unavailableLabel={unavailable}
            icon={card.status !== 'published' ? Megaphone02Icon : Copy01Icon}
            onClick={() => {
              if (card.status !== 'published') {
                run('social:event-cards:publish', { cardId: card.id }).catch(() => {});
              } else {
                exportCard('url').catch(() => {});
              }
            }}
          />
          <ActionIcon
            label={t('social.events.export_qr')}
            available
            unavailableLabel={unavailable}
            icon={QrCodeIcon}
            onClick={() => {
              exportCard('qr-png').catch(() => {});
            }}
          />
        </div>
      }
    >
      <Tabs defaultValue="info" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList variant="line" className="w-full justify-start rounded-none border-b px-3">
          <TabsTrigger value="info">{t('social.studio.crm.tab_info')}</TabsTrigger>
          <TabsTrigger value="updates">{t('social.events.updates')}</TabsTrigger>
          <TabsTrigger value="automations">{t('social.events.automations')}</TabsTrigger>
        </TabsList>
        <TabsContent value="info" className="min-h-0 flex-1 overflow-auto p-3">
          <SectionCard title={t('social.events.details')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <ReadField label={t('social.events.title_label')} value={card.title} />
              <ReadField label={t('social.events.organizer')} value={card.organizer || ''} />
              <ReadField label={t('social.events.venue')} value={card.venueName || ''} />
              <ReadField label={t('social.events.timezone')} value={card.timezone} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {card.description || t('social.events.empty_description')}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => {
                run('social:event-cards:archive', { cardId: card.id }).catch(() => {});
              }}
            >
              <HugeiconsIcon icon={Archive02Icon} data-icon="inline-start" />
              {t('social.events.archive')}
            </Button>
          </SectionCard>
        </TabsContent>
        <TabsContent value="updates" className="min-h-0 flex-1 overflow-auto p-3">
          <UpdatesStudio cards={cards} lockedCardId={card.id} />
        </TabsContent>
        <TabsContent value="automations" className="min-h-0 flex-1 overflow-auto p-3">
          <AutomationsStudio cards={cards} accounts={accounts} posts={posts} lockedCardId={card.id} />
        </TabsContent>
      </Tabs>
    </HubDetailPane>
  );
}

export function SocialEventEditor({ card, onClose, onSaved }: { card: SocialEventCard | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const now = new Date();
  const later = new Date(now.getTime() + 3_600_000);
  const [form, setForm] = useState({
    internalName: card?.internalName ?? '', title: card?.title ?? '', description: card?.description ?? '', organizer: card?.organizer ?? '',
    startsAt: card?.startsAt?.slice(0, 16) ?? now.toISOString().slice(0, 16), endsAt: card?.endsAt?.slice(0, 16) ?? later.toISOString().slice(0, 16),
    timezone: card?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, venueName: card?.venueName ?? '', address: card?.address ?? '', ctaLabel: card?.ctaLabel ?? '', ctaUrl: card?.ctaUrl ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true); setError(null);
    const payload = { ...form, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString(), description: form.description || null, organizer: form.organizer || null, venueName: form.venueName || null, address: form.address || null, ctaLabel: form.ctaLabel || null, ctaUrl: form.ctaUrl || null, design: card?.design ?? {} };
    const response = card ? await window.electron.invoke('social:event-cards:update', { cardId: card.id, patch: payload }) : await window.electron.invoke('social:event-cards:create', payload);
    setSaving(false);
    if (!response?.success) setError(response?.error || 'Error'); else onSaved();
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <h2 className="text-base font-semibold">{card ? t('social.events.edit') : t('social.events.create')}</h2>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="button" onClick={() => { save().catch(() => {}); }} disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {t('common.save')}
          </Button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 overflow-auto xl:grid-cols-[minmax(0,1fr)_26rem]">
        <main className="mx-auto w-full max-w-3xl p-4 lg:p-6">
          {error ? <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <Card><CardHeader><CardTitle>{t('social.events.details')}</CardTitle><CardDescription>{t('social.studio.events.editor_description')}</CardDescription></CardHeader><CardContent><FieldGroup><div className="grid gap-4 md:grid-cols-2"><EventField id="event-internal" label={t('social.events.internal_name')} value={form.internalName} onChange={(value) => update('internalName', value)} /><EventField id="event-title" label={t('social.events.title_label')} value={form.title} onChange={(value) => update('title', value)} /><Field className="md:col-span-2"><FieldLabel htmlFor="event-description">{t('social.events.description_label')}</FieldLabel><Textarea id="event-description" value={form.description} onChange={(event) => update('description', event.target.value)} /></Field><EventField id="event-organizer" label={t('social.events.organizer')} value={form.organizer} onChange={(value) => update('organizer', value)} /><EventField id="event-timezone" label={t('social.events.timezone')} value={form.timezone} onChange={(value) => update('timezone', value)} /><EventField id="event-start" type="datetime-local" label={t('social.events.starts_at')} value={form.startsAt} onChange={(value) => update('startsAt', value)} /><EventField id="event-end" type="datetime-local" label={t('social.events.ends_at')} value={form.endsAt} onChange={(value) => update('endsAt', value)} /><EventField id="event-venue" label={t('social.events.venue')} value={form.venueName} onChange={(value) => update('venueName', value)} /><EventField id="event-address" label={t('social.events.address')} value={form.address} onChange={(value) => update('address', value)} /><EventField id="event-cta-label" label={t('social.events.cta_label')} value={form.ctaLabel} onChange={(value) => update('ctaLabel', value)} /><EventField id="event-cta-url" label={t('social.events.cta_url')} value={form.ctaUrl} onChange={(value) => update('ctaUrl', value)} /></div></FieldGroup></CardContent></Card>
        </main>
        <aside className="hidden border-l bg-muted/30 p-6 xl:block">
          <p className="mb-4 text-xs text-muted-foreground">{t('social.events.preview')}</p>
          <div className="flex aspect-[4/5] flex-col justify-between rounded-lg border bg-card p-6">
            <Badge variant="outline" className="w-fit">{form.organizer || t('social.events.brand')}</Badge>
            <div className="flex flex-col gap-3">
              <p className="text-xl font-semibold">{form.title || t('social.events.preview_title')}</p>
              <p className="text-sm text-muted-foreground">{form.description || t('social.events.preview_cover_placeholder')}</p>
              <p className="text-sm font-medium">{form.startsAt ? new Date(form.startsAt).toLocaleString() : '—'}</p>
              <Badge variant="secondary" className="w-fit">{form.venueName || form.timezone}</Badge>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EventField({ id, label, value, onChange, type = 'text' }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></Field>;
}

function UpdatesStudio({ cards, lockedCardId }: { cards: SocialEventCard[]; lockedCardId?: string }) {
  const { t } = useTranslation();
  const [cardId, setCardId] = useState(lockedCardId ?? cards[0]?.id ?? '');
  const [updates, setUpdates] = useState<SocialEventUpdate[]>([]);
  const [message, setMessage] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const load = useCallback(async () => {
    if (!cardId) return setUpdates([]);
    const response = await window.electron.invoke('social:event-updates:list', { cardId });
    if (response?.success) setUpdates(response.data?.updates ?? []);
  }, [cardId]);
  useEffect(() => { load();
    const unsubscribe = window.electron?.on?.(
      'social:event-updates-refresh',
      (payload: { cardId?: string; updates?: SocialEventUpdate[] }) => {
        if (payload.cardId === cardId) setUpdates(payload.updates ?? []);
      },
    );
    return () => unsubscribe?.();
  }, [cardId, load]);
  const create = async () => {
    const response = await window.electron.invoke('social:event-updates:create', {
      cardId,
      message,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
    if (!response?.success) toast.error(response?.error || 'Error');
    else {
      setMessage('');
      setScheduledAt('');
      await load();
      toast.success(t('social.events.update_created'));
    }
  };
  if (!cards.length) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('social.events.empty')}</EmptyTitle>
          <EmptyDescription>{t('social.events.empty_description')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>{t('social.events.send_update')}</CardTitle>
          <CardDescription>{t('social.events.updates_description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {lockedCardId ? null : (
            <Field>
              <FieldLabel>{t('social.events.cards')}</FieldLabel>
              <CardPicker cards={cards} value={cardId} onChange={setCardId} />
            </Field>
            )}
            <Field>
              <FieldLabel htmlFor="event-update-message">{t('social.events.update_message')}</FieldLabel>
              <Textarea
                id="event-update-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="event-update-time">{t('social.events.when')}</FieldLabel>
              <Input
                id="event-update-time"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </Field>
            <Button
              type="button"
              onClick={() => { create().catch(() => undefined);
              }}
              disabled={!cardId || !message.trim()}
            >
              <HugeiconsIcon icon={Megaphone02Icon} data-icon="inline-start" />
              {t('social.events.send_or_schedule')}
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('social.events.updates')}</CardTitle>
          <CardAction>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => load()}>
              <HugeiconsIcon icon={RefreshIcon} />
              <span className="sr-only">{t('common.refresh')}</span>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('social.events.message')}</TableHead>
                <TableHead>{t('social.events.when')}</TableHead>
                <TableHead>{t('social.events.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {updates.map((update) => (
                <TableRow key={update.id}>
                  <TableCell className="max-w-sm truncate">{update.message}</TableCell>
                  <TableCell>
                    {update.scheduledAt
                      ? new Date(update.scheduledAt).toLocaleString()
                      : t('social.events.now')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{t(`social.events.status_${update.status}`)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AutomationsStudio({
  cards,
  accounts,
  posts,
  lockedCardId,
}: {
  cards: SocialEventCard[];
  accounts: SocialAccount[];
  posts: SocialPost[];
  lockedCardId?: string;
}) {
  const { t } = useTranslation();
  const instagram = accounts.filter(
    (account) => account.provider === 'instagram' && account.status === 'active',
  );
  const [rules, setRules] = useState<SocialDmRule[]>([]);
  const [accountId, setAccountId] = useState(instagram[0]?.id ?? '');
  const [cardId, setCardId] = useState(lockedCardId ?? cards[0]?.id ?? '');
  const [postId, setPostId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [template, setTemplate] = useState('');
  const [commentReplyEnabled, setCommentReplyEnabled] = useState(true);
  const [commentReplyTemplate, setCommentReplyTemplate] = useState(
    t('social.events.comment_reply_placeholder'),
  );
  const [captureLead, setCaptureLead] = useState(true);
  const openPeopleTab = useTabStore((s) => s.openPeopleTab);
  const selectedAccount = instagram.find((account) => account.id === accountId);
  const selectedPost = posts.find((post) => post.id === postId);
  const load = useCallback(async () => {
    const response = await window.electron.invoke('social:dm-rules:list');
    if (response?.success) setRules(response.data?.rules ?? []);
  }, []);
  useEffect(() => { load();
    const unsubscribe = window.electron?.on?.(
      'social:dm-rules-refresh',
      (payload: { rules?: SocialDmRule[] }) => setRules(payload.rules ?? []),
    );
    return () => unsubscribe?.();
  }, [load]);
  const create = async () => {
    const response = await window.electron.invoke('social:dm-rules:create', {
      accountId,
      cardId,
      postId: postId || null,
      keyword,
      replyTemplate: template,
      enabled: true,
      commentReplyEnabled,
      commentReplyTemplate: commentReplyTemplate.trim() || t('social.events.comment_reply_placeholder'),
      captureLead,
    });
    if (!response?.success) toast.error(response?.error || 'Error');
    else {
      setKeyword('');
      setTemplate('');
      setCommentReplyEnabled(true);
      setCommentReplyTemplate(t('social.events.comment_reply_placeholder'));
      setCaptureLead(true);
      await load();
      toast.success(t('social.events.rule_created'));
    }
  };
  return (
    <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>{t('social.events.activate')}</CardTitle>
          <CardDescription>{t('social.events.automations_description')}</CardDescription>
          <CardAction>
            <Button type="button" variant="ghost" size="sm" onClick={() => openPeopleTab()}>
              {t('social.events.view_leads')}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>{t('social.events.instagram_account')}</FieldLabel>
              <Select value={accountId} onValueChange={(value) => setAccountId(value ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {selectedAccount ? socialAccountLabel(selectedAccount) : '…'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {instagram.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {socialAccountLabel(account)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {lockedCardId ? null : (
            <Field>
              <FieldLabel>{t('social.events.cards')}</FieldLabel>
              <CardPicker cards={cards} value={cardId} onChange={setCardId} />
            </Field>
            )}
            <Field>
              <FieldLabel>{t('social.events.publication')}</FieldLabel>
              <Select
                value={postId || '__any__'}
                onValueChange={(value) => setPostId(value === '__any__' ? '' : value ?? '')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {postId
                      ? selectedPost
                        ? socialPostLabel(selectedPost)
                        : '…'
                      : t('social.events.any_publication')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="__any__">{t('social.events.any_publication')}</SelectItem>
                    {posts
                      .filter((post) => post.provider === 'instagram' && post.status === 'published')
                      .map((post) => (
                        <SelectItem key={post.id} value={post.id}>
                          {socialPostLabel(post)}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="dm-keyword">{t('social.events.keyword')}</FieldLabel>
              <Input
                id="dm-keyword"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dm-template">{t('social.events.reply_template')}</FieldLabel>
              <Textarea
                id="dm-template"
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
              />
            </Field>
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="dm-comment-reply">{t('social.events.comment_reply_enabled')}</FieldLabel>
                <Switch
                  id="dm-comment-reply"
                  checked={commentReplyEnabled}
                  onCheckedChange={setCommentReplyEnabled}
                />
              </div>
            </Field>
            {commentReplyEnabled ? (
              <Field>
                <FieldLabel htmlFor="dm-comment-reply-template">
                  {t('social.events.comment_reply_template')}
                </FieldLabel>
                <Textarea
                  id="dm-comment-reply-template"
                  value={commentReplyTemplate}
                  onChange={(event) => setCommentReplyTemplate(event.target.value)}
                  placeholder={t('social.events.comment_reply_placeholder')}
                  rows={2}
                />
              </Field>
            ) : null}
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="dm-capture-lead">{t('social.events.capture_lead')}</FieldLabel>
                <Switch
                  id="dm-capture-lead"
                  checked={captureLead}
                  onCheckedChange={setCaptureLead}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t('social.events.capture_lead_hint')}</p>
            </Field>
            <Button
              type="button"
              onClick={() => { create().catch(() => undefined);
              }}
              disabled={
                !accountId ||
                !cardId ||
                !keyword.trim() ||
                !template.trim() ||
                (commentReplyEnabled && !commentReplyTemplate.trim())
              }
            >
              <HugeiconsIcon icon={MagicWand01Icon} data-icon="inline-start" />
              {t('social.events.activate')}
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('social.events.automations')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('social.events.keyword')}</TableHead>
                <TableHead>{t('social.events.cards')}</TableHead>
                <TableHead>{t('social.events.comment_reply_template')}</TableHead>
                <TableHead>{t('social.events.capture_lead')}</TableHead>
                <TableHead>{t('social.events.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => {
                const card = cards.find((item) => item.id === rule.eventCardId);
                return (
                  <TableRow key={rule.id}>
                    <TableCell>{rule.keyword}</TableCell>
                    <TableCell>
                      {card ? socialEventCardLabel(card) : t('social.events.unknown_card')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={rule.commentReplyEnabled ? 'secondary' : 'outline'}>
                        {rule.commentReplyEnabled
                          ? t('social.events.comment_reply_on')
                          : t('social.events.comment_reply_off')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={rule.captureLead !== false ? 'secondary' : 'outline'}>
                        {rule.captureLead !== false
                          ? t('social.events.capture_lead_on')
                          : t('social.events.capture_lead_off')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={rule.status === 'active' ? 'secondary' : 'outline'}>
                        {t(`social.events.status_${rule.status}`)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CardPicker({
  cards,
  value,
  onChange,
}: {
  cards: SocialEventCard[];
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = cards.find((card) => card.id === value);
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? '')}>
      <SelectTrigger className="w-full">
        <SelectValue>{selected ? socialEventCardLabel(selected) : '…'}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {cards.map((card) => (
            <SelectItem key={card.id} value={card.id}>
              {socialEventCardLabel(card)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
