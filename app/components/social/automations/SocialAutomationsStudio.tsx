import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon, BubbleChatIcon, Delete02Icon, Edit02Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ListState from '@/components/shared/ListState';
import type { SocialAccount, SocialPost, SocialReplyRule } from '../socialTypes';
import { socialAccountLabel, socialPostLabel } from '@/lib/social/socialQueues';
import { ProviderMark } from '../crm/socialCrmChrome';

type AccountCapability = { accountId: string; listComments: boolean; sendDm: boolean };
const freshRule = (accountId: string): SocialReplyRule => ({ id: '', enabled: true, mode: 'draft_only', hashtag: '', replyTemplate: '', linkUrl: '', accountIds: accountId ? [accountId] : [], postIds: [] });

export function SocialAutomationsStudio({ accounts, posts, initialAccountId, onOpenInbox, onOpenAccounts }: {
  accounts: SocialAccount[]; posts: SocialPost[]; initialAccountId: string | null; onOpenInbox: () => void; onOpenAccounts: () => void;
}) {
  const { t } = useTranslation();
  const [rules, setRules] = useState<SocialReplyRule[]>([]);
  const [capabilities, setCapabilities] = useState<AccountCapability[]>([]);
  const [draft, setDraft] = useState(() => freshRule(initialAccountId || accounts.find((a) => a.status === 'active')?.id || ''));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    window.electron.invoke('social:capabilities').then((response) => {
      if (cancelled) return;
      if (!response?.success) throw new Error(response?.error || t('social.direct.error'));
      setRules(response.data?.liveReplyRules || []);
      setCapabilities(response.data?.accounts || []);
    }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : t('social.direct.error')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t]);
  const accountId = draft.accountIds?.[0] || '';
  const account = accounts.find((item) => item.id === accountId);
  const capability = capabilities.find((item) => item.accountId === accountId);
  const availablePosts = posts.filter((post) => post.accountId === accountId && post.status === 'published' && post.externalPostId);
  const postId = draft.postIds?.[0] || '';
  const active = rules.filter((rule) => rule.enabled !== false).length;
  const update = (patch: Partial<SocialReplyRule>) => setDraft((current) => ({ ...current, ...patch }));
  const persist = async (next: SocialReplyRule[]) => {
    setSaving(true); setError('');
    try {
      const response = await window.electron.invoke('social:live-reply-rules:set', { rules: next });
      if (!response?.success) throw new Error(response?.error || t('social.direct.error'));
      setRules(response.data.rules);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('social.direct.error'));
      return false;
    } finally { setSaving(false); }
  };
  const save = async () => {
    const rule = { ...draft, id: draft.id || crypto.randomUUID(), hashtag: draft.hashtag.trim(), replyTemplate: draft.replyTemplate?.trim(), linkUrl: draft.linkUrl?.trim() || null };
    const next = draft.id ? rules.map((item) => item.id === draft.id ? rule : item) : [...rules, rule];
    if (await persist(next)) { setDraft(freshRule(accountId)); toast.success(t('social.direct.saved')); }
  };
  const preview = (draft.replyTemplate || t('social.direct.message_placeholder')).replace(/\{\{\s*(author|hashtag|link|comment)\s*\}\}/gi, (_, key: string) => ({ author: t('social.direct.example_author'), hashtag: draft.hashtag || t('social.direct.keyword_example'), link: draft.linkUrl || t('social.direct.optional_link'), comment: draft.hashtag || t('social.direct.keyword_example') })[key.toLowerCase()] || '');
  if (loading) return <ListState variant="loading" loadingLabel={t('common.loading')} fullHeight />;
  return <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-5">
      <div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold tracking-tight">{t('social.direct.title')}</h2><Badge variant="mint">{t('social.direct.active_count', { count: active })}</Badge></div><p className="mt-1 max-w-xl text-sm text-muted-foreground">{t('social.direct.description')}</p></div>
      <Button variant="outline" onClick={onOpenInbox}><HugeiconsIcon icon={BubbleChatIcon} data-icon="inline-start" />{t('social.studio.nav.inbox')}</Button>
    </header>
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="grid gap-8 @[68rem]/social-studio:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <form onSubmit={(event) => { event.preventDefault(); save().catch(() => setError(t('social.direct.error'))); }} className="flex min-w-0 flex-col gap-6">
          <div className="flex items-center justify-between"><h3 className="text-base font-semibold">{t(draft.id ? 'social.direct.edit' : 'social.direct.new')}</h3>{draft.id ? <Button variant="ghost" size="sm" onClick={() => setDraft(freshRule(accountId))}>{t('common.cancel')}</Button> : null}</div>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <RuleSelect label={t('social.direct.account')} value={accountId} onChange={(value) => update({ accountIds: [value], postIds: [], mode: 'draft_only' })} options={accounts.filter((item) => item.status === 'active').map((item) => ({ value: item.id, label: socialAccountLabel(item) }))} />
              <RuleSelect label={t('social.events.publication')} value={postId || '__all__'} onChange={(value) => update({ postIds: value === '__all__' ? [] : [value] })} options={[{ value: '__all__', label: t('social.events.any_publication') }, ...availablePosts.map((post) => ({ value: post.id, label: socialPostLabel(post) }))]} />
            </div>
            <Field><FieldLabel htmlFor="direct-keyword">{t('social.direct.keyword')}</FieldLabel><Input id="direct-keyword" value={draft.hashtag} required maxLength={200} placeholder={t('social.direct.keyword_example')} onChange={(event) => update({ hashtag: event.target.value })} /><p className="text-xs text-muted-foreground">{t('social.direct.keyword_hint')}</p></Field>
            <Field><FieldLabel htmlFor="direct-message">{t('social.direct.message')}</FieldLabel><Textarea id="direct-message" required maxLength={2000} rows={5} value={draft.replyTemplate || ''} placeholder={t('social.direct.message_placeholder')} onChange={(event) => update({ replyTemplate: event.target.value })} /><p className="text-xs text-muted-foreground">{t('social.direct.variables')}</p></Field>
            <Field><FieldLabel htmlFor="direct-link">{t('social.direct.optional_link')}</FieldLabel><Input id="direct-link" type="url" value={draft.linkUrl || ''} placeholder="https://" onChange={(event) => update({ linkUrl: event.target.value })} /></Field>
            <RuleSelect label={t('social.direct.delivery')} value={draft.mode || 'draft_only'} onChange={(value) => update({ mode: value as SocialReplyRule['mode'] })} options={[{ value: 'draft_only', label: t('social.direct.review') }, { value: 'live', label: t('social.direct.live'), disabled: !capability?.sendDm || !capability?.listComments }]} />
            {(!capability?.listComments || !capability?.sendDm) ? <Alert><AlertDescription>{t('social.direct.permissions')}<Button type="button" variant="link" className="h-auto px-0" onClick={onOpenAccounts}>{t('social.studio.nav.accounts')}</Button></AlertDescription></Alert> : null}
            <Button type="submit" disabled={saving || !account || !draft.hashtag.trim() || !draft.replyTemplate?.trim() || (draft.mode === 'live' && (!capability?.sendDm || !capability?.listComments))}><HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />{t(saving ? 'social.direct.saving' : 'social.direct.save')}</Button>
          </FieldGroup>
        </form>
        <aside className="flex flex-col gap-5 rounded-2xl bg-muted/40 p-6">
          <div><p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t('social.direct.preview')}</p><h3 className="mt-2 text-2xl font-semibold tracking-tight">{t('social.direct.preview_title')}</h3></div>
          <ol className="flex flex-col gap-5">
            <li className="flex gap-3"><Badge variant="outline">1</Badge><div><p className="text-sm font-semibold">{t('social.direct.when')}</p><p className="mt-2 break-words text-sm text-muted-foreground">“{draft.hashtag || t('social.direct.keyword_example')}”</p></div></li>
            <li className="flex gap-3"><Badge variant="outline">2</Badge><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{t('social.direct.then')}</p><blockquote className="mt-3 whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-background p-4 text-sm leading-relaxed">{preview}</blockquote></div></li>
            <li className="flex gap-3"><Badge variant="outline">3</Badge><div><p className="text-sm font-semibold">{t(draft.mode === 'live' ? 'social.direct.live' : 'social.direct.review')}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(draft.mode === 'live' ? 'social.direct.live_hint' : 'social.direct.review_hint')}</p></div></li>
          </ol>
          <p className="mt-auto border-t pt-4 text-xs leading-relaxed text-muted-foreground">{t('social.direct.runtime')}</p>
        </aside>
      </div>
      <section className="border-t pt-6"><h3 className="mb-4 text-base font-semibold">{t('social.direct.your_rules')}</h3>
        {!rules.length ? <ListState variant="empty" title={t('social.direct.empty')} description={t('social.direct.empty_hint')} compact /> : <ul className="flex flex-col divide-y">
          {rules.map((rule) => { const owner = accounts.find((item) => rule.accountIds?.includes(item.id)); return <li key={rule.id} className="flex flex-wrap items-center gap-4 py-4">
            {owner ? <ProviderMark provider={owner.provider} /> : <HugeiconsIcon icon={BubbleChatIcon} className="size-6 text-muted-foreground" />}
            <div className="min-w-0 flex-1 basis-40"><p className="flex items-center gap-2 text-sm font-semibold">{rule.hashtag}<HugeiconsIcon icon={ArrowRight01Icon} className="size-4 text-muted-foreground" /><span className="font-normal text-muted-foreground">DM</span></p><p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{rule.replyTemplate}</p><p className="mt-1 text-xs text-muted-foreground">{owner ? socialAccountLabel(owner) : t('social.studio.overview.all_networks')}</p></div>
            <Badge variant="outline">{t(rule.mode === 'live' ? 'social.direct.live' : 'social.direct.review')}</Badge>
            <Switch checked={rule.enabled !== false} disabled={saving} aria-label={t('social.direct.toggle', { keyword: rule.hashtag })} onCheckedChange={(enabled) => { persist(rules.map((item) => item.id === rule.id ? { ...item, enabled } : item)).catch(() => setError(t('social.direct.error'))); }} />
            <Button variant="ghost" size="icon-sm" aria-label={t('social.direct.edit_rule', { keyword: rule.hashtag })} disabled={saving} onClick={() => setDraft({ ...rule })}><HugeiconsIcon icon={Edit02Icon} /></Button>
            <Button variant="ghost" size="icon-sm" aria-label={t('social.direct.delete_rule', { keyword: rule.hashtag })} disabled={saving} onClick={() => { persist(rules.filter((item) => item.id !== rule.id)).then((ok) => { if (ok && draft.id === rule.id) setDraft(freshRule(accountId)); }).catch(() => setError(t('social.direct.error'))); }}><HugeiconsIcon icon={Delete02Icon} /></Button>
          </li>; })}
        </ul>}
      </section>
    </div>
  </div>;
}

function RuleSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string; disabled?: boolean }> }) {
  return <Field><FieldLabel>{label}</FieldLabel><Select value={value} onValueChange={(next) => { if (next) onChange(next); }}><SelectTrigger className="w-full" aria-label={label}><SelectValue>{options.find((item) => item.value === value)?.label || '—'}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>;
}
