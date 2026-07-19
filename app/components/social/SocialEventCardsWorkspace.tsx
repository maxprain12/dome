import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft02Icon,
  Calendar03Icon,
  CloudCogIcon,
  Download04Icon,
  EyeIcon,
  PencilEdit02Icon,
  PlusSignIcon,
  RefreshIcon,
  WalletCardsIcon,
} from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { EventCardDesignPanel } from './EventCardDesignPanel';
import { EventCardCoverStrip, EventCardPreview } from './EventCardPreview';
import {
  DEFAULT_BACKGROUND,
  DEFAULT_LABEL,
  defaultEventCardDesign,
  normalizeEventCardDesign,
  normalizeHex,
  serializeEventCardDesign,
} from './eventCardDesign';
import type { SocialAccount, SocialDmRule, SocialEventCard, SocialEventUpdate, SocialPost } from './socialTypes';

type CardsScreen = 'list' | 'editor';

export type SocialEventSection = 'cards' | 'updates' | 'automations' | 'analytics';

type ProviderErrorKind = 'not_connected' | 'disabled' | 'generic';
type CardForm = Omit<SocialEventCard, 'id' | 'slug' | 'publicUrl' | 'status' | 'version' | 'walletStatus'>;

const KNOWN_METRIC_KEYS = [
  'page_view',
  'qr_scan',
  'apple_download',
  'apple_registered',
  'google_save_click',
  'notification_sent',
  'notification_attempted',
  'notification_failed',
  'dm_matched',
  'dm_sent',
  'dm_failed',
] as const;

function localDate(iso: string) {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultForm(): CardForm {
  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  return {
    internalName: '',
    title: '',
    description: '',
    organizer: '',
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    venueName: '',
    address: '',
    latitude: null,
    longitude: null,
    ctaLabel: '',
    ctaUrl: '',
    design: defaultEventCardDesign(),
  };
}

function toCardInput(form: CardForm) {
  return {
    ...form,
    description: form.description || null,
    organizer: form.organizer || null,
    venueName: form.venueName || null,
    address: form.address || null,
    ctaLabel: form.ctaLabel || null,
    ctaUrl: form.ctaUrl || null,
    design: serializeEventCardDesign(form.design),
  };
}

function unwrapCards(data: unknown): SocialEventCard[] {
  return ((data as { cards?: SocialEventCard[] } | null)?.cards ?? []);
}

function classifyProviderError(message: string | undefined): ProviderErrorKind {
  const text = (message ?? '').toLowerCase();
  if (text.includes('not connected') || text.includes('dome provider is not connected')) {
    return 'not_connected';
  }
  if (text.includes('social_event_cards_disabled')) {
    return 'disabled';
  }
  return 'generic';
}

function toastProviderError(
  t: (key: string) => string,
  message: string | undefined,
  fallbackKey: string,
) {
  const kind = classifyProviderError(message);
  if (kind === 'not_connected') toast.error(t('social.events.not_connected'));
  else if (kind === 'disabled') toast.error(t('social.events.disabled_hint'));
  else toast.error(t(fallbackKey));
}

function statusLabel(t: (key: string, opts?: Record<string, string>) => string, status: string) {
  return t(`social.events.status_${status}`, { defaultValue: status });
}

function metricLabel(t: (key: string, opts?: Record<string, string>) => string, key: string) {
  return t(`social.events.metrics.${key}`, {
    defaultValue: t('social.events.metrics.other', { key }),
  });
}

function orderedMetricEntries(totals: Record<string, number>): Array<[string, number]> {
  const known = new Set<string>(KNOWN_METRIC_KEYS);
  const ordered: Array<[string, number]> = [];
  for (const key of KNOWN_METRIC_KEYS) {
    if (key in totals) ordered.push([key, totals[key] ?? 0]);
  }
  const extras = Object.entries(totals)
    .filter(([key]) => !known.has(key))
    .sort(([a], [b]) => a.localeCompare(b));
  return [...ordered, ...extras];
}

function formFromCard(card: SocialEventCard): CardForm {
  return {
    internalName: card.internalName,
    title: card.title,
    description: card.description ?? '',
    organizer: card.organizer ?? '',
    startsAt: card.startsAt,
    endsAt: card.endsAt,
    timezone: card.timezone,
    venueName: card.venueName ?? '',
    address: card.address ?? '',
    latitude: card.latitude,
    longitude: card.longitude,
    ctaLabel: card.ctaLabel ?? '',
    ctaUrl: card.ctaUrl ?? '',
    design: normalizeEventCardDesign(card.design),
  };
}

export function SocialEventCardsWorkspace({
  section,
  accounts,
  posts,
  onConnectDome,
}: {
  section: SocialEventSection;
  accounts: SocialAccount[];
  posts: SocialPost[];
  onConnectDome: () => void;
}) {
  const { t } = useTranslation();
  const [cards, setCards] = useState<SocialEventCard[] | null>(null);
  const [providerError, setProviderError] = useState<ProviderErrorKind | null>(null);
  const [wallet, setWallet] = useState({ appleConfigured: false, googleConfigured: false });
  const [screen, setScreen] = useState<CardsScreen>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingCard, setViewingCard] = useState<SocialEventCard | null>(null);
  const [form, setForm] = useState<CardForm>(defaultForm);
  const [saving, setSaving] = useState(false);
  const loadedFormRef = useRef('');
  const editingCard = useMemo(() => {
    if (!editingId) return null;
    return cards?.find((card) => card.id === editingId) ?? null;
  }, [cards, editingId]);

  const load = useCallback(async () => {
    const response = await window.electron.invoke('social:event-cards:list');
    if (!response?.success) {
      setCards([]);
      setProviderError(classifyProviderError(response?.error));
      return;
    }
    setProviderError(null);
    const next = unwrapCards(response.data);
    setWallet(
      (response.data as { wallet?: { appleConfigured: boolean; googleConfigured: boolean } })?.wallet
        ?? { appleConfigured: false, googleConfigured: false },
    );
    setCards(next);
  }, []);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  useEffect(() => {
    if (section !== 'cards') setScreen('list');
  }, [section]);

  useEffect(() => {
    if (screen !== 'editor' || !editingId || !editingCard) return;
    const nextForm = formFromCard(editingCard);
    loadedFormRef.current = JSON.stringify(nextForm);
    setForm(nextForm);
  }, [screen, editingId, editingCard]);

  useEffect(() => {
    if (screen !== 'editor' || !editingId) return;
    const serialized = JSON.stringify(form);
    if (serialized === loadedFormRef.current) return;
    const timer = globalThis.setTimeout(() => {
      setSaving(true);
      void window.electron
        .invoke('social:event-cards:update', { cardId: editingId, patch: toCardInput(form) })
        .then((response) => {
          setSaving(false);
          if (!response?.success) {
            toastProviderError(t, response?.error, 'social.events.save_error');
            return;
          }
          loadedFormRef.current = serialized;
          const updated = (response.data as { card?: SocialEventCard })?.card;
          if (updated) {
            setCards((current) => current?.map((card) => (card.id === updated.id ? updated : card)) ?? []);
          }
        })
        .catch(() => {
          setSaving(false);
        });
    }, 900);
    return () => globalThis.clearTimeout(timer);
  }, [form, editingId, screen, t]);

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm());
    loadedFormRef.current = '';
    setScreen('editor');
  };

  const openEdit = (card: SocialEventCard) => {
    setEditingId(card.id);
    setForm(formFromCard(card));
    loadedFormRef.current = JSON.stringify(formFromCard(card));
    setScreen('editor');
  };

  const backToList = () => {
    setScreen('list');
    setEditingId(null);
  };

  const save = async () => {
    if (!form.internalName.trim() || !form.title.trim()) {
      toast.error(t('social.events.required'));
      return;
    }
    setSaving(true);
    const response = editingId
      ? await window.electron.invoke('social:event-cards:update', { cardId: editingId, patch: toCardInput(form) })
      : await window.electron.invoke('social:event-cards:create', toCardInput(form));
    setSaving(false);
    if (!response?.success) {
      toastProviderError(t, response?.error, 'social.events.save_error');
      return;
    }
    toast.success(t('social.events.saved'));
    await load();
    const id = (response.data as { card?: SocialEventCard })?.card?.id ?? (response.data as SocialEventCard)?.id;
    if (id) setEditingId(id);
    else backToList();
  };

  const changeStatus = async (action: 'publish' | 'archive') => {
    if (!editingId) return;
    const response = await window.electron.invoke(`social:event-cards:${action}`, { cardId: editingId });
    if (!response?.success) toastProviderError(t, response?.error, 'social.events.save_error');
    else {
      toast.success(action === 'publish' ? t('social.events.published') : t('social.events.archived'));
      await load();
    }
  };

  if (cards === null) {
    return (
      <div className="grid gap-4 p-6 @[40rem]/social:grid-cols-2 @[60rem]/social:grid-cols-3">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    );
  }

  if (providerError) {
    return (
      <ProviderErrorState
        kind={providerError}
        onRetry={() => {
          void load().catch(() => {});
        }}
        onConnectDome={onConnectDome}
      />
    );
  }

  if (section === 'updates') return <UpdatesPanel cards={cards} />;
  if (section === 'automations') return <AutomationsPanel cards={cards} accounts={accounts} posts={posts} />;
  if (section === 'analytics') return <AnalyticsPanel cards={cards} />;

  if (screen === 'editor') {
    return (
      <EventCardEditorScreen
        form={form}
        setForm={setForm}
        wallet={wallet}
        publicUrl={editingCard?.publicUrl ?? null}
        status={editingCard?.status ?? null}
        isCreate={!editingId}
        saving={saving}
        editingId={editingId}
        onBack={backToList}
        onSave={() => {
          void save().catch(() => {});
        }}
        onPublish={() => {
          void changeStatus('publish').catch(() => {});
        }}
        onArchive={() => {
          void changeStatus('archive').catch(() => {});
        }}
      />
    );
  }

  return (
    <>
      <EventCardsListScreen
        cards={cards}
        onCreate={openCreate}
        onEdit={openEdit}
        onView={setViewingCard}
      />
      <EventCardViewDialog
        card={viewingCard}
        wallet={wallet}
        open={viewingCard !== null}
        onOpenChange={(open) => {
          if (!open) setViewingCard(null);
        }}
        onEdit={() => {
          if (!viewingCard) return;
          const card = viewingCard;
          setViewingCard(null);
          openEdit(card);
        }}
      />
    </>
  );
}

function EventCardsListScreen({
  cards,
  onCreate,
  onEdit,
  onView,
}: {
  cards: SocialEventCard[];
  onCreate: () => void;
  onEdit: (card: SocialEventCard) => void;
  onView: (card: SocialEventCard) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="@container/event-cards flex h-full min-h-0 flex-col gap-6 overflow-auto p-4 @[50rem]/event-cards:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium">{t('social.events.cards')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('social.events.cards_description')}</p>
        </div>
        {cards.length > 0 ? (
          <Button type="button" size="sm" onClick={onCreate}>
            <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
            {t('social.events.new')}
          </Button>
        ) : null}
      </div>

      {cards.length === 0 ? (
        <Empty className="flex-1 rounded-xl border border-dashed bg-card py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={WalletCardsIcon} />
            </EmptyMedia>
            <EmptyTitle>{t('social.events.empty')}</EmptyTitle>
            <EmptyDescription>{t('social.events.empty_description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={onCreate}>
              <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
              {t('social.events.new')}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 @[36rem]/event-cards:grid-cols-2 @[70rem]/event-cards:grid-cols-3">
          {cards.map((card) => {
            const design = normalizeEventCardDesign(card.design);
            return (
            <Card key={card.id} className="min-w-0 overflow-hidden">
              <EventCardCoverStrip
                coverUrl={design.coverUrl}
                labelColor={normalizeHex(design.labelColor, DEFAULT_LABEL)}
                placeholderBackground={normalizeHex(design.backgroundColor, DEFAULT_BACKGROUND)}
                placeholder={t('social.events.preview_cover_placeholder')}
              />
              <CardHeader className="gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{card.internalName}</CardTitle>
                    <CardDescription className="truncate">{card.title}</CardDescription>
                  </div>
                  <Badge variant={card.status === 'published' ? 'mint' : 'outline'} className="shrink-0">
                    {statusLabel(t, card.status)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{new Date(card.startsAt).toLocaleString()}</p>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => onView(card)}>
                  <HugeiconsIcon icon={EyeIcon} data-icon="inline-start" />
                  {t('social.events.view')}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => onEdit(card)}>
                  <HugeiconsIcon icon={PencilEdit02Icon} data-icon="inline-start" />
                  {t('social.events.edit')}
                </Button>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EventCardEditorScreen({
  form,
  setForm,
  wallet,
  publicUrl,
  status,
  isCreate,
  saving,
  editingId,
  onBack,
  onSave,
  onPublish,
  onArchive,
}: {
  form: CardForm;
  setForm: Dispatch<SetStateAction<CardForm>>;
  wallet: { appleConfigured: boolean; googleConfigured: boolean };
  publicUrl: string | null;
  status: SocialEventCard['status'] | null;
  isCreate: boolean;
  saving: boolean;
  editingId: string | null;
  onBack: () => void;
  onSave: () => void;
  onPublish: () => void;
  onArchive: () => void;
}) {
  const { t } = useTranslation();
  const patchDesign = (patch: Partial<CardForm['design']>) => {
    setForm((v) => ({ ...v, design: { ...v.design, ...patch } }));
  };

  return (
    <div className="@container/event-cards flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3 @[50rem]/event-cards:px-6">
        <div className="min-w-0">
          <Button type="button" variant="ghost" size="sm" className="mb-1 -ml-2" onClick={onBack}>
            <HugeiconsIcon icon={ArrowLeft02Icon} data-icon="inline-start" />
            {t('social.events.back_to_cards')}
          </Button>
          <h2 className="truncate text-base font-medium">
            {isCreate ? t('social.events.new') : form.title || t('social.events.edit')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('social.events.editor_description')}</p>
        </div>
        {status ? (
          <Badge variant={status === 'published' ? 'mint' : 'outline'}>{statusLabel(t, status)}</Badge>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid gap-8 p-4 @[50rem]/event-cards:p-6 @[70rem]/event-cards:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="order-2 min-w-0 @[70rem]/event-cards:order-1">
            <Tabs defaultValue="content" className="gap-4">
              <TabsList variant="line" className="w-full max-w-md">
                <TabsTrigger value="content">{t('social.events.tab_content')}</TabsTrigger>
                <TabsTrigger value="design">{t('social.events.tab_design')}</TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="mt-2 text-sm">
                <FieldGroup className="gap-8">
                  <FieldSet>
                    <FieldLegend>{t('social.events.section_basics')}</FieldLegend>
                    <div className="grid gap-4 @[36rem]/event-cards:grid-cols-2">
                      <TextField
                        label={t('social.events.internal_name')}
                        value={form.internalName}
                        onChange={(internalName) => setForm((v) => ({ ...v, internalName }))}
                      />
                      <TextField
                        label={t('social.events.title')}
                        value={form.title}
                        onChange={(title) => setForm((v) => ({ ...v, title }))}
                      />
                    </div>
                    <Field>
                      <FieldLabel>{t('social.events.description')}</FieldLabel>
                      <Textarea
                        value={form.description ?? ''}
                        onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))}
                        rows={3}
                      />
                    </Field>
                    <TextField
                      label={t('social.events.organizer')}
                      value={form.organizer ?? ''}
                      onChange={(organizer) => setForm((v) => ({ ...v, organizer }))}
                    />
                  </FieldSet>

                  <Separator />

                  <FieldSet>
                    <FieldLegend>{t('social.events.section_schedule')}</FieldLegend>
                    <div className="grid gap-4 @[36rem]/event-cards:grid-cols-2">
                      <TextField
                        label={t('social.events.timezone')}
                        value={form.timezone}
                        onChange={(timezone) => setForm((v) => ({ ...v, timezone }))}
                      />
                      <div className="hidden @[36rem]/event-cards:block" />
                      <Field>
                        <FieldLabel>{t('social.events.start')}</FieldLabel>
                        <Input
                          type="datetime-local"
                          value={localDate(form.startsAt)}
                          onChange={(e) =>
                            setForm((v) => ({ ...v, startsAt: new Date(e.target.value).toISOString() }))
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel>{t('social.events.end')}</FieldLabel>
                        <Input
                          type="datetime-local"
                          value={localDate(form.endsAt)}
                          onChange={(e) =>
                            setForm((v) => ({ ...v, endsAt: new Date(e.target.value).toISOString() }))
                          }
                        />
                      </Field>
                    </div>
                  </FieldSet>

                  <Separator />

                  <FieldSet>
                    <FieldLegend>{t('social.events.section_venue')}</FieldLegend>
                    <div className="grid gap-4 @[36rem]/event-cards:grid-cols-2">
                      <TextField
                        label={t('social.events.venue')}
                        value={form.venueName ?? ''}
                        onChange={(venueName) => setForm((v) => ({ ...v, venueName }))}
                      />
                      <TextField
                        label={t('social.events.address')}
                        value={form.address ?? ''}
                        onChange={(address) => setForm((v) => ({ ...v, address }))}
                      />
                    </div>
                  </FieldSet>

                  <Separator />

                  <FieldSet>
                    <FieldLegend>{t('social.events.section_cta')}</FieldLegend>
                    <div className="grid gap-4 @[36rem]/event-cards:grid-cols-2">
                      <TextField
                        label={t('social.events.cta')}
                        value={form.ctaLabel ?? ''}
                        onChange={(ctaLabel) => setForm((v) => ({ ...v, ctaLabel }))}
                      />
                      <TextField
                        label={t('social.events.cta_url')}
                        value={form.ctaUrl ?? ''}
                        onChange={(ctaUrl) => setForm((v) => ({ ...v, ctaUrl }))}
                      />
                    </div>
                  </FieldSet>
                </FieldGroup>
              </TabsContent>

              <TabsContent value="design" className="mt-2 text-sm">
                <EventCardDesignPanel design={form.design} onChange={patchDesign} />
              </TabsContent>
            </Tabs>
          </div>

          <EventCardPreview form={form} wallet={wallet} publicUrl={publicUrl} />
        </div>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur @[50rem]/event-cards:px-6">
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? t('social.events.saving') : t('social.events.save')}
        </Button>
        {status !== 'published' && !isCreate ? (
          <Button type="button" variant="outline" disabled={!editingId} onClick={onPublish}>
            {t('social.events.publish')}
          </Button>
        ) : null}
        {status === 'published' && !isCreate ? (
          <Button type="button" variant="outline" onClick={onArchive}>
            {t('social.events.archive')}
          </Button>
        ) : null}
        {editingId && !isCreate ? <ExportButtons cardId={editingId} /> : null}
      </div>
    </div>
  );
}

function EventCardViewDialog({
  card,
  wallet,
  open,
  onOpenChange,
  onEdit,
}: {
  card: SocialEventCard | null;
  wallet: { appleConfigured: boolean; googleConfigured: boolean };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open && card !== null} onOpenChange={onOpenChange}>
      {card ? (
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{card.title}</DialogTitle>
            <DialogDescription>{card.internalName}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto p-5">
            <EventCardPreview
              form={formFromCard(card)}
              wallet={wallet}
              publicUrl={card.publicUrl}
              className="border-0 shadow-none"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant={card.status === 'published' ? 'mint' : 'outline'}>
                {statusLabel(t, card.status)}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {new Date(card.startsAt).toLocaleString()}
              </span>
            </div>
          </div>
          <DialogFooter className="border-t px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.close')}
            </Button>
            <Button type="button" onClick={onEdit}>
              <HugeiconsIcon icon={PencilEdit02Icon} data-icon="inline-start" />
              {t('social.events.edit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function ProviderErrorState({
  kind,
  onRetry,
  onConnectDome,
}: {
  kind: ProviderErrorKind;
  onRetry: () => void;
  onConnectDome: () => void;
}) {
  const { t } = useTranslation();
  const isConnect = kind === 'not_connected';
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Empty className="max-w-md rounded-xl border bg-card py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={CloudCogIcon} />
          </EmptyMedia>
          <EmptyTitle>
            {isConnect ? t('social.events.not_connected') : t('social.events.provider_error')}
          </EmptyTitle>
          <EmptyDescription>
            {kind === 'disabled'
              ? t('social.events.disabled_hint')
              : isConnect
                ? t('social.events.not_connected_description')
                : t('social.events.provider_error_description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {isConnect ? (
            <Button type="button" onClick={onConnectDome}>
              {t('social.events.connect_cta')}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={onRetry}>
              <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
              {t('social.events.retry')}
            </Button>
          )}
        </EmptyContent>
      </Empty>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Field className={className}>
      <FieldLabel>{label}</FieldLabel>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function ExportButtons({ cardId }: { cardId: string }) {
  const { t } = useTranslation();
  const run = async (format: 'url' | 'snippet' | 'qr-svg' | 'qr-png' | 'pdf') => {
    const response = await window.electron.invoke('social:event-cards:export', { cardId, format });
    if (!response?.success) {
      toastProviderError(t, response?.error, 'social.events.export_error');
      return;
    }
    const content = (response.data as { content?: string })?.content;
    if (content) await navigator.clipboard.writeText(content);
    toast.success(content ? t('social.events.copied') : t('social.events.exported'));
  };
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          void run('url').catch(() => {});
        }}
      >
        {t('social.events.copy_url')}
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          void run('qr-png').catch(() => {});
        }}
      >
        <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />
        {t('social.events.export_qr')}
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          void run('pdf').catch(() => {});
        }}
      >
        {t('social.events.export_a4')}
      </Button>
    </>
  );
}

function UpdatesPanel({ cards }: { cards: SocialEventCard[] }) {
  const { t } = useTranslation();
  const [cardId, setCardId] = useState(cards[0]?.id ?? '');
  const [updates, setUpdates] = useState<SocialEventUpdate[]>([]);
  const [message, setMessage] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const load = useCallback(async () => {
    if (!cardId) {
      setUpdates([]);
      return;
    }
    const r = await window.electron.invoke('social:event-updates:list', { cardId });
    if (!r?.success) {
      toastProviderError(t, r?.error, 'social.events.provider_error');
      setUpdates([]);
      return;
    }
    setUpdates((r.data as { updates?: SocialEventUpdate[] })?.updates ?? []);
  }, [cardId, t]);
  useEffect(() => {
    void load().catch(() => {});
  }, [load]);
  if (!cards.length) return <CardsEmpty />;
  return (
    <Panel title={t('social.events.updates')} description={t('social.events.updates_description')}>
      <div className="grid gap-4 @[40rem]/social:grid-cols-3">
        <Field>
          <FieldLabel>{t('social.events.cards')}</FieldLabel>
          <CardSelect cards={cards} value={cardId} onChange={setCardId} />
        </Field>
        <Field>
          <FieldLabel>{t('social.events.update_message')}</FieldLabel>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('social.events.update_message')}
          />
        </Field>
        <Field>
          <FieldLabel>{t('social.events.when')}</FieldLabel>
          <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </Field>
      </div>
      <Button
        className="mt-4"
        onClick={() => {
          void (async () => {
            const r = await window.electron.invoke('social:event-updates:create', {
              cardId,
              message,
              scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
            });
            if (r?.success) {
              setMessage('');
              await load();
              toast.success(t('social.events.update_created'));
            } else toastProviderError(t, r?.error, 'social.events.save_error');
          })().catch(() => {});
        }}
      >
        {t('social.events.send_or_schedule')}
      </Button>
      <Table className="mt-6">
        <TableHeader>
          <TableRow>
            <TableHead>{t('social.events.message')}</TableHead>
            <TableHead>{t('social.events.when')}</TableHead>
            <TableHead>{t('social.events.status')}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {updates.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.message}</TableCell>
              <TableCell>
                {u.scheduledAt ? new Date(u.scheduledAt).toLocaleString() : t('social.events.now')}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{statusLabel(t, u.status)}</Badge>
              </TableCell>
              <TableCell>
                {u.status === 'scheduled' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void (async () => {
                        await window.electron.invoke('social:event-updates:cancel', { updateId: u.id });
                        await load();
                      })().catch(() => {});
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function AutomationsPanel({
  cards,
  accounts,
  posts,
}: {
  cards: SocialEventCard[];
  accounts: SocialAccount[];
  posts: SocialPost[];
}) {
  const { t } = useTranslation();
  const instagram = accounts.filter((a) => a.provider === 'instagram' && a.status === 'active');
  const [rules, setRules] = useState<SocialDmRule[]>([]);
  const [accountId, setAccountId] = useState(instagram[0]?.id ?? '');
  const [cardId, setCardId] = useState(cards[0]?.id ?? '');
  const [postId, setPostId] = useState('');
  const [keyword, setKeyword] = useState('INFO');
  const [replyTemplate, setReplyTemplate] = useState('{{event}} · {{date}} · {{location}}\n{{link}}');
  const load = useCallback(async () => {
    const r = await window.electron.invoke('social:dm-rules:list');
    if (!r?.success) {
      toastProviderError(t, r?.error, 'social.events.provider_error');
      setRules([]);
      return;
    }
    setRules((r.data as { rules?: SocialDmRule[] })?.rules ?? []);
  }, [t]);
  useEffect(() => {
    void load().catch(() => {});
  }, [load]);
  if (!cards.length) return <CardsEmpty />;
  return (
    <Panel title={t('social.events.automations')} description={t('social.events.automations_description')}>
      {!instagram.length ? (
        <Badge variant="outline">{t('social.events.instagram_required')}</Badge>
      ) : (
        <div className="grid gap-4 @[40rem]/social:grid-cols-2">
          <Field>
            <FieldLabel>{t('social.events.instagram_account')}</FieldLabel>
            <Select value={accountId} onValueChange={(v) => setAccountId(v ?? '')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {instagram.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.displayName || a.handle || a.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{t('social.events.cards')}</FieldLabel>
            <CardSelect cards={cards} value={cardId} onChange={setCardId} />
          </Field>
          <Field>
            <FieldLabel>{t('social.events.publication')}</FieldLabel>
            <Select
              value={postId || '__any__'}
              onValueChange={(v) => setPostId(!v || v === '__any__' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('social.events.publication')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">{t('social.events.any_publication')}</SelectItem>
                {posts
                  .filter((p) => p.provider === 'instagram' && p.status === 'published' && p.externalPostId)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.body.slice(0, 80) || p.externalPostId}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{t('social.events.keyword')}</FieldLabel>
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </Field>
          <Field className="@[40rem]/social:col-span-2">
            <FieldLabel>{t('social.events.reply_template')}</FieldLabel>
            <Textarea value={replyTemplate} onChange={(e) => setReplyTemplate(e.target.value)} rows={3} />
          </Field>
        </div>
      )}
      <Button
        className="mt-4"
        disabled={!accountId || !cardId}
        onClick={() => {
          void (async () => {
            const r = await window.electron.invoke('social:dm-rules:create', {
              accountId,
              cardId,
              postId: postId || null,
              keyword,
              replyTemplate,
              enabled: true,
            });
            if (r?.success) {
              await load();
              toast.success(t('social.events.rule_created'));
            } else toastProviderError(t, r?.error, 'social.events.save_error');
          })().catch(() => {});
        }}
      >
        {t('social.events.activate')}
      </Button>
      <Table className="mt-6">
        <TableHeader>
          <TableRow>
            <TableHead>{t('social.events.keyword')}</TableHead>
            <TableHead>{t('social.events.status')}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.keyword}</TableCell>
              <TableCell>
                <Badge variant={r.status === 'active' ? 'mint' : 'outline'}>{statusLabel(t, r.status)}</Badge>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void (async () => {
                      await window.electron.invoke('social:dm-rules:delete', { ruleId: r.id });
                      await load();
                    })().catch(() => {});
                  }}
                >
                  {t('common.delete')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function AnalyticsPanel({ cards }: { cards: SocialEventCard[] }) {
  const { t } = useTranslation();
  const [cardId, setCardId] = useState(cards[0]?.id ?? '');
  const [totals, setTotals] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!cardId) {
      setTotals({});
      return;
    }
    setTotals(null);
    void window.electron
      .invoke('social:event-cards:metrics', { cardId })
      .then((r) => {
        if (!r?.success) {
          toastProviderError(t, r?.error, 'social.events.provider_error');
          setTotals({});
          return;
        }
        setTotals((r.data as { metrics?: { totals?: Record<string, number> } })?.metrics?.totals ?? {});
      })
      .catch(() => {
        setTotals({});
      });
  }, [cardId, t]);
  if (!cards.length) return <CardsEmpty />;
  const entries = totals ? orderedMetricEntries(totals) : [];
  return (
    <div className="@container/analytics flex h-full min-h-0 flex-col gap-6 overflow-auto p-4 @[50rem]/analytics:p-6">
      <div className="flex flex-col gap-4 @[40rem]/analytics:flex-row @[40rem]/analytics:items-end @[40rem]/analytics:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-medium">{t('social.events.analytics')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('social.events.analytics_description')}</p>
        </div>
        <Field className="w-full max-w-xs">
          <FieldLabel>{t('social.events.cards')}</FieldLabel>
          <CardSelect cards={cards} value={cardId} onChange={setCardId} />
        </Field>
      </div>

      {totals === null ? (
        <div className="grid gap-3 @[30rem]/analytics:grid-cols-2 @[50rem]/analytics:grid-cols-3 @[70rem]/analytics:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : entries.length === 0 ? (
        <Empty className="rounded-xl border bg-card py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Calendar03Icon} />
            </EmptyMedia>
            <EmptyTitle>{t('social.events.no_metrics')}</EmptyTitle>
            <EmptyDescription>{t('social.events.analytics_empty_hint')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 @[30rem]/analytics:grid-cols-2 @[50rem]/analytics:grid-cols-3 @[70rem]/analytics:grid-cols-4">
          {entries.map(([key, value]) => (
            <Card key={key} className="min-w-0">
              <CardHeader className="gap-3 pb-4">
                <CardDescription className="truncate text-xs tracking-wide uppercase">
                  {metricLabel(t, key)}
                </CardDescription>
                <CardTitle className="text-3xl font-semibold tabular-nums tracking-tight">
                  {value.toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CardSelect({
  cards,
  value,
  onChange,
}: {
  cards: SocialEventCard[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {cards.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.internalName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-auto p-4 @[50rem]/social:p-6">
      <div className="mb-6">
        <h2 className="text-base font-medium">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function CardsEmpty() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Empty className="max-w-md rounded-xl border bg-card py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Calendar03Icon} />
          </EmptyMedia>
          <EmptyTitle>{t('social.events.empty')}</EmptyTitle>
          <EmptyDescription>{t('social.events.empty_description')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <HugeiconsIcon icon={WalletCardsIcon} className="text-muted-foreground" />
        </EmptyContent>
      </Empty>
    </div>
  );
}
