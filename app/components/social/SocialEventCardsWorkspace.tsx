import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import { Calendar03Icon, Download04Icon, PlusSignIcon, WalletCardsIcon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { SocialAccount, SocialDmRule, SocialEventCard, SocialEventUpdate, SocialPost } from './socialTypes';

export type SocialEventSection = 'cards' | 'updates' | 'automations' | 'analytics';

type CardForm = Omit<SocialEventCard, 'id' | 'slug' | 'publicUrl' | 'status' | 'version' | 'walletStatus'>;

function localDate(iso: string) {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultForm(): CardForm {
  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  return {
    internalName: '', title: '', description: '', organizer: '',
    startsAt: start.toISOString(), endsAt: end.toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    venueName: '', address: '', latitude: null, longitude: null, ctaLabel: '', ctaUrl: '', design: {},
  };
}

function toCardInput(form: CardForm) {
  return {
    ...form,
    description: form.description || null, organizer: form.organizer || null, venueName: form.venueName || null,
    address: form.address || null, ctaLabel: form.ctaLabel || null, ctaUrl: form.ctaUrl || null,
  };
}

function unwrapCards(data: unknown): SocialEventCard[] {
  return ((data as { cards?: SocialEventCard[] } | null)?.cards ?? []);
}

export function SocialEventCardsWorkspace({ section, accounts, posts }: { section: SocialEventSection; accounts: SocialAccount[]; posts: SocialPost[] }) {
  const { t } = useTranslation();
  const [cards, setCards] = useState<SocialEventCard[] | null>(null);
  const [wallet, setWallet] = useState({ appleConfigured: false, googleConfigured: false });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<CardForm>(defaultForm);
  const [saving, setSaving] = useState(false);
  const loadedFormRef = useRef('');
  const selected = useMemo(() => cards?.find((card) => card.id === selectedId) ?? null, [cards, selectedId]);

  const load = useCallback(async () => {
    const response = await window.electron.invoke('social:event-cards:list');
    if (!response?.success) {
      setCards([]);
      toast.error(response?.error || t('social.events.provider_error'));
      return;
    }
    const next = unwrapCards(response.data);
    setWallet((response.data as { wallet?: { appleConfigured: boolean; googleConfigured: boolean } })?.wallet ?? { appleConfigured: false, googleConfigured: false });
    setCards(next);
    setSelectedId((current) => current && next.some((card) => card.id === current) ? current : next[0]?.id ?? null);
  }, [t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selected) return;
    const nextForm = {
      internalName: selected.internalName, title: selected.title, description: selected.description ?? '', organizer: selected.organizer ?? '',
      startsAt: selected.startsAt, endsAt: selected.endsAt, timezone: selected.timezone, venueName: selected.venueName ?? '', address: selected.address ?? '',
      latitude: selected.latitude, longitude: selected.longitude, ctaLabel: selected.ctaLabel ?? '', ctaUrl: selected.ctaUrl ?? '', design: selected.design ?? {},
    };
    loadedFormRef.current = JSON.stringify(nextForm);
    setForm(nextForm);
  }, [selected]);

  useEffect(() => {
    if (!selectedId) return;
    const serialized = JSON.stringify(form);
    if (serialized === loadedFormRef.current) return;
    const timer = window.setTimeout(() => {
      setSaving(true);
      void window.electron.invoke('social:event-cards:update', { cardId: selectedId, patch: toCardInput(form) }).then((response) => {
        setSaving(false);
        if (!response?.success) return;
        loadedFormRef.current = serialized;
        const updated = (response.data as { card?: SocialEventCard })?.card;
        if (updated) setCards((current) => current?.map((card) => card.id === updated.id ? updated : card) ?? []);
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [form, selectedId]);

  const save = async () => {
    if (!form.internalName.trim() || !form.title.trim()) return toast.error(t('social.events.required'));
    setSaving(true);
    const response = selectedId
      ? await window.electron.invoke('social:event-cards:update', { cardId: selectedId, patch: toCardInput(form) })
      : await window.electron.invoke('social:event-cards:create', toCardInput(form));
    setSaving(false);
    if (!response?.success) return toast.error(response?.error || t('social.events.save_error'));
    toast.success(t('social.events.saved'));
    await load();
    const id = (response.data as { card?: SocialEventCard })?.card?.id ?? (response.data as SocialEventCard)?.id;
    if (id) setSelectedId(id);
  };

  const changeStatus = async (action: 'publish' | 'archive') => {
    if (!selectedId) return;
    const response = await window.electron.invoke(`social:event-cards:${action}`, { cardId: selectedId });
    if (!response?.success) toast.error(response?.error || t('social.events.save_error'));
    else { toast.success(action === 'publish' ? t('social.events.published') : t('social.events.archived')); await load(); }
  };

  if (cards === null) return <div className="grid gap-4 p-6 md:grid-cols-3"><Skeleton className="h-48" /><Skeleton className="h-48 md:col-span-2" /></div>;
  if (section === 'updates') return <UpdatesPanel cards={cards} />;
  if (section === 'automations') return <AutomationsPanel cards={cards} accounts={accounts} posts={posts} />;
  if (section === 'analytics') return <AnalyticsPanel cards={cards} />;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-auto p-4 md:grid-cols-[18rem_minmax(0,1fr)] md:gap-4 md:overflow-hidden">
      <Card className="min-h-0 md:overflow-auto">
        <CardHeader>
          <CardTitle>{t('social.events.cards')}</CardTitle>
          <CardDescription>{t('social.events.cards_description')}</CardDescription>
          <CardAction><Button size="icon-sm" onClick={() => { setSelectedId(null); setForm(defaultForm()); }} aria-label={t('social.events.new')}><HugeiconsIcon icon={PlusSignIcon} /></Button></CardAction>
        </CardHeader>
        <CardContent className="space-y-2">
          {cards.length === 0 ? <p className="text-muted-foreground">{t('social.events.empty')}</p> : cards.map((card) => (
            <Button key={card.id} variant={selectedId === card.id ? 'secondary' : 'ghost'} className="h-auto w-full justify-between py-3 text-left" onClick={() => setSelectedId(card.id)}>
              <span className="min-w-0"><span className="block truncate font-medium">{card.internalName}</span><span className="block truncate text-xs text-muted-foreground">{new Date(card.startsAt).toLocaleString()}</span></span>
              <Badge variant={card.status === 'published' ? 'mint' : 'outline'}>{card.status}</Badge>
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="min-h-0 overflow-auto">
        <Card>
          <CardHeader><CardTitle>{selected ? selected.title : t('social.events.new')}</CardTitle><CardDescription>{t('social.events.editor_description')}</CardDescription></CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={t('social.events.internal_name')} value={form.internalName} onChange={(internalName) => setForm((v) => ({ ...v, internalName }))} />
                <TextField label={t('social.events.title')} value={form.title} onChange={(title) => setForm((v) => ({ ...v, title }))} />
              </div>
              <Field><FieldLabel>{t('social.events.description')}</FieldLabel><Textarea value={form.description ?? ''} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={t('social.events.organizer')} value={form.organizer ?? ''} onChange={(organizer) => setForm((v) => ({ ...v, organizer }))} />
                <TextField label={t('social.events.timezone')} value={form.timezone} onChange={(timezone) => setForm((v) => ({ ...v, timezone }))} />
                <Field><FieldLabel>{t('social.events.start')}</FieldLabel><Input type="datetime-local" value={localDate(form.startsAt)} onChange={(e) => setForm((v) => ({ ...v, startsAt: new Date(e.target.value).toISOString() }))} /></Field>
                <Field><FieldLabel>{t('social.events.end')}</FieldLabel><Input type="datetime-local" value={localDate(form.endsAt)} onChange={(e) => setForm((v) => ({ ...v, endsAt: new Date(e.target.value).toISOString() }))} /></Field>
                <TextField label={t('social.events.venue')} value={form.venueName ?? ''} onChange={(venueName) => setForm((v) => ({ ...v, venueName }))} />
                <TextField label={t('social.events.address')} value={form.address ?? ''} onChange={(address) => setForm((v) => ({ ...v, address }))} />
                <TextField label={t('social.events.cta')} value={form.ctaLabel ?? ''} onChange={(ctaLabel) => setForm((v) => ({ ...v, ctaLabel }))} />
                <TextField label={t('social.events.cta_url')} value={form.ctaUrl ?? ''} onChange={(ctaUrl) => setForm((v) => ({ ...v, ctaUrl }))} />
                <TextField label={t('social.events.brand')} value={form.design.brandName ?? ''} onChange={(brandName) => setForm((v) => ({ ...v, design: { ...v.design, brandName } }))} />
                <TextField label={t('social.events.cover')} value={form.design.coverUrl ?? ''} onChange={(coverUrl) => setForm((v) => ({ ...v, design: { ...v.design, coverUrl } }))} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void save()} disabled={saving}>{saving ? t('social.events.saving') : t('social.events.save')}</Button>
                {selected?.status !== 'published' ? <Button variant="outline" onClick={() => void changeStatus('publish')} disabled={!selectedId}>{t('social.events.publish')}</Button> : null}
                {selected?.status === 'published' ? <Button variant="outline" onClick={() => void changeStatus('archive')}>{t('social.events.archive')}</Button> : null}
                {selectedId ? <ExportButtons cardId={selectedId} /> : null}
              </div>
            </FieldGroup>
            <Card variant="mint" className="self-start">
              {form.design.coverUrl ? <img src={form.design.coverUrl} alt="" className="h-32 w-full object-cover" /> : null}
              <CardHeader><CardDescription>{form.design.brandName || form.organizer}</CardDescription><CardTitle className="text-xl">{form.title || t('social.events.preview_title')}</CardTitle></CardHeader>
              <CardContent className="space-y-3"><p>{new Date(form.startsAt).toLocaleString()}</p><p>{form.venueName || form.address}</p><p className="text-muted-foreground">{form.description}</p><div className="flex flex-wrap gap-2"><Badge variant={wallet.appleConfigured ? 'outline' : 'secondary'}>Apple Wallet · {wallet.appleConfigured ? 'OK' : t('social.events.setup_required')}</Badge><Badge variant={wallet.googleConfigured ? 'outline' : 'secondary'}>Google Wallet · {wallet.googleConfigured ? 'OK' : t('social.events.setup_required')}</Badge></div>{selected?.publicUrl ? <p className="break-all text-xs">{selected.publicUrl}</p> : null}</CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field><FieldLabel>{label}</FieldLabel><Input value={value} onChange={(event) => onChange(event.target.value)} /></Field>;
}

function ExportButtons({ cardId }: { cardId: string }) {
  const { t } = useTranslation();
  const run = async (format: 'url' | 'snippet' | 'qr-svg' | 'qr-png' | 'pdf') => {
    const response = await window.electron.invoke('social:event-cards:export', { cardId, format });
    if (!response?.success) return toast.error(response?.error || t('social.events.export_error'));
    const content = (response.data as { content?: string })?.content;
    if (content) await navigator.clipboard.writeText(content);
    toast.success(content ? t('social.events.copied') : t('social.events.exported'));
  };
  return <><Button variant="outline" onClick={() => void run('url')}>{t('social.events.copy_url')}</Button><Button variant="outline" onClick={() => void run('qr-png')}><HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />QR</Button><Button variant="outline" onClick={() => void run('pdf')}>A4</Button></>;
}

function UpdatesPanel({ cards }: { cards: SocialEventCard[] }) {
  const { t } = useTranslation();
  const [cardId, setCardId] = useState(cards[0]?.id ?? '');
  const [updates, setUpdates] = useState<SocialEventUpdate[]>([]);
  const [message, setMessage] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const load = useCallback(async () => { if (!cardId) return setUpdates([]); const r = await window.electron.invoke('social:event-updates:list', { cardId }); setUpdates(r?.success ? ((r.data as { updates?: SocialEventUpdate[] })?.updates ?? []) : []); }, [cardId]);
  useEffect(() => { void load(); }, [load]);
  if (!cards.length) return <CardsEmpty />;
  return <Panel title={t('social.events.updates')} description={t('social.events.updates_description')}>
    <div className="grid gap-3 md:grid-cols-3"><CardSelect cards={cards} value={cardId} onChange={setCardId} /><Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('social.events.update_message')} /><Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
    <Button className="mt-3" onClick={async () => { const r = await window.electron.invoke('social:event-updates:create', { cardId, message, scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null }); if (r?.success) { setMessage(''); await load(); toast.success(t('social.events.update_created')); } else toast.error(r?.error); }}>{t('social.events.send_or_schedule')}</Button>
    <Table className="mt-5"><TableHeader><TableRow><TableHead>{t('social.events.message')}</TableHead><TableHead>{t('social.events.when')}</TableHead><TableHead>{t('social.events.status')}</TableHead><TableHead /></TableRow></TableHeader><TableBody>{updates.map((u) => <TableRow key={u.id}><TableCell>{u.message}</TableCell><TableCell>{u.scheduledAt ? new Date(u.scheduledAt).toLocaleString() : t('social.events.now')}</TableCell><TableCell><Badge variant="outline">{u.status}</Badge></TableCell><TableCell>{u.status === 'scheduled' ? <Button size="sm" variant="ghost" onClick={async () => { await window.electron.invoke('social:event-updates:cancel', { updateId: u.id }); await load(); }}>{t('common.cancel')}</Button> : null}</TableCell></TableRow>)}</TableBody></Table>
  </Panel>;
}

function AutomationsPanel({ cards, accounts, posts }: { cards: SocialEventCard[]; accounts: SocialAccount[]; posts: SocialPost[] }) {
  const { t } = useTranslation();
  const instagram = accounts.filter((a) => a.provider === 'instagram' && a.status === 'active');
  const [rules, setRules] = useState<SocialDmRule[]>([]);
  const [accountId, setAccountId] = useState(instagram[0]?.id ?? '');
  const [cardId, setCardId] = useState(cards[0]?.id ?? '');
  const [postId, setPostId] = useState('');
  const [keyword, setKeyword] = useState('INFO');
  const [replyTemplate, setReplyTemplate] = useState('{{event}} · {{date}} · {{location}}\n{{link}}');
  const load = useCallback(async () => { const r = await window.electron.invoke('social:dm-rules:list'); setRules(r?.success ? ((r.data as { rules?: SocialDmRule[] })?.rules ?? []) : []); }, []);
  useEffect(() => { void load(); }, [load]);
  if (!cards.length) return <CardsEmpty />;
  return <Panel title={t('social.events.automations')} description={t('social.events.automations_description')}>
    {!instagram.length ? <Badge variant="outline">{t('social.events.instagram_required')}</Badge> : <div className="grid gap-3 md:grid-cols-2"><Select value={accountId} onValueChange={(v) => setAccountId(v ?? '')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{instagram.map((a) => <SelectItem key={a.id} value={a.id}>{a.displayName || a.handle || a.id}</SelectItem>)}</SelectContent></Select><CardSelect cards={cards} value={cardId} onChange={setCardId} /><Select value={postId || '__any__'} onValueChange={(v) => setPostId(!v || v === '__any__' ? '' : v)}><SelectTrigger><SelectValue placeholder={t('social.events.publication')} /></SelectTrigger><SelectContent><SelectItem value="__any__">{t('social.events.any_publication')}</SelectItem>{posts.filter((p) => p.provider === 'instagram' && p.status === 'published' && p.externalPostId).map((p) => <SelectItem key={p.id} value={p.id}>{p.body.slice(0, 80) || p.externalPostId}</SelectItem>)}</SelectContent></Select><Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={t('social.events.keyword')} /><Textarea value={replyTemplate} onChange={(e) => setReplyTemplate(e.target.value)} /></div>}
    <Button className="mt-3" disabled={!accountId || !cardId} onClick={async () => { const r = await window.electron.invoke('social:dm-rules:create', { accountId, cardId, postId: postId || null, keyword, replyTemplate, enabled: true }); if (r?.success) { await load(); toast.success(t('social.events.rule_created')); } else toast.error(r?.error); }}>{t('social.events.activate')}</Button>
    <Table className="mt-5"><TableHeader><TableRow><TableHead>{t('social.events.keyword')}</TableHead><TableHead>{t('social.events.status')}</TableHead><TableHead /></TableRow></TableHeader><TableBody>{rules.map((r) => <TableRow key={r.id}><TableCell>{r.keyword}</TableCell><TableCell><Badge variant={r.status === 'active' ? 'mint' : 'outline'}>{r.status}</Badge></TableCell><TableCell><Button variant="ghost" size="sm" onClick={async () => { await window.electron.invoke('social:dm-rules:delete', { ruleId: r.id }); await load(); }}>{t('common.delete')}</Button></TableCell></TableRow>)}</TableBody></Table>
  </Panel>;
}

function AnalyticsPanel({ cards }: { cards: SocialEventCard[] }) {
  const { t } = useTranslation();
  const [cardId, setCardId] = useState(cards[0]?.id ?? '');
  const [totals, setTotals] = useState<Record<string, number>>({});
  useEffect(() => { if (!cardId) return; void window.electron.invoke('social:event-cards:metrics', { cardId }).then((r) => setTotals(r?.success ? ((r.data as { metrics?: { totals?: Record<string, number> } })?.metrics?.totals ?? {}) : {})); }, [cardId]);
  if (!cards.length) return <CardsEmpty />;
  return <Panel title={t('social.events.analytics')} description={t('social.events.analytics_description')}><CardSelect cards={cards} value={cardId} onChange={setCardId} /><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(totals).map(([key, value]) => <Card key={key}><CardHeader><CardDescription>{key}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader></Card>)}{Object.keys(totals).length === 0 ? <p className="text-muted-foreground">{t('social.events.no_metrics')}</p> : null}</div></Panel>;
}

function CardSelect({ cards, value, onChange }: { cards: SocialEventCard[]; value: string; onChange: (value: string) => void }) { return <Select value={value} onValueChange={(v) => onChange(v ?? '')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.internalName}</SelectItem>)}</SelectContent></Select>; }
function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <div className="h-full overflow-auto p-4"><Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card></div>; }
function CardsEmpty() { const { t } = useTranslation(); return <Empty><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={Calendar03Icon} /></EmptyMedia><EmptyTitle>{t('social.events.empty')}</EmptyTitle><EmptyDescription>{t('social.events.empty_description')}</EmptyDescription></EmptyHeader><EmptyContent><HugeiconsIcon icon={WalletCardsIcon} /></EmptyContent></Empty>; }
