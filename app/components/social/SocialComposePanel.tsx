import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Building2Icon, CalendarDaysIcon, Cancel01Icon, ComputerIcon, Delete02Icon, Film01Icon, HashIcon, Image01Icon, ImageAdd01Icon, InstagramIcon, LibraryIcon, Link02Icon, Linkedin01Icon, MagicWand01Icon, Scissor01Icon, SparklesIcon, TwitterIcon } from '@hugeicons/core-free-icons';
import { useAppStore } from '@/lib/store/useAppStore';
import { chat } from '@/lib/ai/client';
import SocialLibraryTree from '@/components/social/SocialLibraryTree';
import SocialPostPreview, {
  PROVIDER_FORMATS,
  deriveFormat,
  mediaKey,
  type SocialPostFormat,
} from '@/components/social/SocialPostPreview';
import {
  PROVIDER_CHAR_LIMITS,
  type SocialAccount,
  type SocialLibraryItem,
  type SocialMediaItem,
  type SocialPost,
  type SocialProvider,
} from '@/components/social/socialTypes';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { DateTimePicker } from '@/components/shared/DateTimePicker';
import { InlineDetailCard } from '@/components/shared/InlineDetailCard';
import { cn } from '@/lib/utils';

const PROVIDER_ICONS: Record<SocialProvider, IconSvgElement> = { linkedin: Linkedin01Icon, instagram: InstagramIcon, x: TwitterIcon };
const PROVIDER_LABELS = { linkedin: 'LinkedIn', instagram: 'Instagram', x: 'X' } as const;
const ALL_PROVIDERS: SocialProvider[] = ['linkedin', 'instagram', 'x'];

/** Video file extensions we can detect from a public media URL. */
const VIDEO_URL_RE = /\.(mp4|mov|m4v|webm|avi|mkv)([?#]|$)/i;

type AiAction = 'improve' | 'hashtags' | 'shorten' | 'generate';
type AiTone = 'professional' | 'casual' | 'selling' | 'informative';

const AI_TONES: AiTone[] = ['professional', 'casual', 'selling', 'informative'];

interface Props {
  accounts: SocialAccount[];
  editingPost: SocialPost | null;
  /** Prefill campaign when creating a new draft from a campaign queue. */
  initialCampaign?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

function toLocalInputValue(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

export default function SocialComposePanel({
  accounts,
  editingPost,
  initialCampaign = null,
  onClose,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const [selectedProviders, setSelectedProviders] = useState<SocialProvider[]>(
    editingPost ? [editingPost.provider] : ['linkedin'],
  );
  const [body, setBody] = useState(editingPost?.body ?? '');
  const [linkUrl, setLinkUrl] = useState(editingPost?.linkUrl ?? '');
  const [mediaUrl, setMediaUrl] = useState('');
  const [media, setMedia] = useState<SocialMediaItem[]>(editingPost?.media ?? []);
  const [topics, setTopics] = useState((editingPost?.topics ?? []).join(', '));
  const [campaign, setCampaign] = useState(editingPost?.campaign ?? initialCampaign ?? '');
  const [scheduleAt, setScheduleAt] = useState(toLocalInputValue(editingPost?.scheduledAt ?? null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [library, setLibrary] = useState<SocialLibraryItem[] | null>(null);
  const [previewProvider, setPreviewProvider] = useState<SocialProvider>(
    editingPost?.provider ?? 'linkedin',
  );
  const [formatOverrides, setFormatOverrides] = useState<Partial<Record<SocialProvider, SocialPostFormat>>>({});
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [aiBusy, setAiBusy] = useState<AiAction | null>(null);
  const [aiTone, setAiTone] = useState<AiTone>('professional');
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');

  const linkedInAccounts = useMemo(
    () => accounts.filter((a) => a.provider === 'linkedin' && a.status === 'active'),
    [accounts],
  );
  const defaultLinkedInAccount = useMemo(
    () => linkedInAccounts.find((a) => a.accountKind === 'organization') ?? linkedInAccounts[0] ?? null,
    [linkedInAccounts],
  );
  const [linkedInAccountId, setLinkedInAccountId] = useState<string | null>(
    editingPost?.provider === 'linkedin' ? (editingPost.accountId ?? defaultLinkedInAccount?.id ?? null) : (defaultLinkedInAccount?.id ?? null),
  );

  const isEditing = Boolean(editingPost);

  const minLimit = useMemo(
    () => Math.min(...selectedProviders.map((p) => PROVIDER_CHAR_LIMITS[p])),
    [selectedProviders],
  );
  const overLimit = body.length > minLimit;
  const needsMedia = selectedProviders.includes('instagram') && media.length === 0;
  // The Instagram-Login API has no binary upload at all — local files (photo
  // or video) can't reach Instagram; only public https URLs work there.
  const igLocalMediaWarning =
    selectedProviders.includes('instagram') && media.some((m) => !m.url);

  useEffect(() => {
    if (!showLibrary || library !== null) return;
    void (async () => {
      const res = await window.electron.invoke('social:media:library', { projectId });
      setLibrary(res?.success ? res.data : []);
    })();
  }, [showLibrary, library, projectId]);

  // Keep the preview pointed at a selected provider.
  useEffect(() => {
    if (!selectedProviders.includes(previewProvider) && selectedProviders.length > 0) {
      setPreviewProvider(selectedProviders[0]);
    }
  }, [selectedProviders, previewProvider]);

  // Fetch real thumbnails for image media (data URLs from the main process).
  useEffect(() => {
    for (const m of media) {
      const key = mediaKey(m);
      if (!key || thumbnails[key] !== undefined) continue;
      if (m.type === 'video' || m.type === 'reel') continue;
      if (m.url) {
        setThumbnails((prev) => ({ ...prev, [key]: m.url as string }));
        continue;
      }
      setThumbnails((prev) => ({ ...prev, [key]: '' })); // mark as pending
      void (async () => {
        const res = await window.electron.invoke('social:media:preview', {
          ...(m.path ? { path: m.path } : {}),
          ...(m.resourceId ? { resourceId: m.resourceId } : {}),
        });
        if (res?.success && res.data?.dataUrl) {
          setThumbnails((prev) => ({ ...prev, [key]: res.data.dataUrl }));
        }
      })();
    }
  }, [media, thumbnails]);

  const previewFormat: SocialPostFormat =
    formatOverrides[previewProvider] ?? deriveFormat(previewProvider, media, linkUrl.trim());
  const previewAccount =
    (previewProvider === 'linkedin' && linkedInAccountId
      ? accounts.find((a) => a.id === linkedInAccountId)
      : null) ??
    accounts.find((a) => a.provider === previewProvider && a.status === 'active') ??
    accounts.find((a) => a.provider === previewProvider) ??
    null;
  const previewHasVideo = media.some((m) => m.type === 'video' || m.type === 'reel');

  const toggleProvider = (p: SocialProvider) => {
    if (isEditing) return;
    setSelectedProviders((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const pickLocalFiles = async () => {
    setError(null);
    const res = await window.electron.invoke('social:media:pick');
    if (!res?.success) {
      setError(res?.error || 'Error');
      return;
    }
    const items = res.data?.items ?? [];
    if (items.length > 0) {
      setMedia((prev) => [
        ...prev,
        ...items.map((f: { path: string; name: string; type: 'image' | 'video' }) => ({
          type: f.type,
          path: f.path,
          name: f.name,
        })),
      ]);
    }
  };

  const selectedLibraryIds = useMemo(
    () => new Set(media.map((m) => m.resourceId).filter((id): id is string => Boolean(id))),
    [media],
  );

  const addLibraryItem = (item: SocialLibraryItem) => {
    // Prefix the folder path so identically named files stay distinguishable
    // in the selected-media list (name is display-only).
    const name = item.folderPath ? `${item.folderPath} / ${item.title}` : item.title;
    setMedia((prev) =>
      prev.some((m) => m.resourceId === item.resourceId)
        ? prev
        : [...prev, { type: item.type, resourceId: item.resourceId, name }],
    );
  };

  const addMedia = () => {
    const url = mediaUrl.trim();
    if (!url) return;
    // Detect videos (e.g. signed MinIO/S3 .mp4 URLs) so the preview renders
    // them with <video> and Instagram treats them as Reels.
    const type: SocialMediaItem['type'] = VIDEO_URL_RE.test(url) ? 'video' : 'image';
    setMedia((prev) => [...prev, { type, url }]);
    setMediaUrl('');
  };

  const toggleMediaType = (index: number) => {
    setMedia((prev) =>
      prev.map((m, i) => {
        if (i !== index || !m.url) return m;
        const next: SocialMediaItem['type'] = m.type === 'video' || m.type === 'reel' ? 'image' : 'video';
        return { ...m, type: next };
      }),
    );
  };

  // ── AI copy assistant ───────────────────────────────────────────────────────
  const runAiAssist = async (action: AiAction) => {
    setError(null);
    const trimmed = body.trim();
    const brief = [
      topics.trim() && `Temas: ${topics.trim()}`,
      campaign.trim() && `Campaña: ${campaign.trim()}`,
      linkUrl.trim() && `Enlace: ${linkUrl.trim()}`,
    ].filter(Boolean).join('\n');

    if (action !== 'generate' && !trimmed) {
      setError(t('social.composer.ai_need_text'));
      return;
    }
    if (action === 'generate' && !trimmed && !brief) {
      setError(t('social.composer.ai_need_brief'));
      return;
    }

    const networks = selectedProviders.map((p) => PROVIDER_LABELS[p]).join(', ');
    const toneNames: Record<AiTone, string> = {
      professional: 'profesional',
      casual: 'cercano y conversacional',
      selling: 'persuasivo orientado a conversión',
      informative: 'informativo y claro',
    };
    const system =
      'Eres un copywriter experto en redes sociales. Respondes SOLO con el texto final del post, ' +
      'sin comillas, sin explicaciones ni preámbulos. Mantén el idioma del usuario ' +
      `(si no hay texto, escribe en el idioma del brief). Redes destino: ${networks}. ` +
      `Límite duro: ${minLimit} caracteres. Tono: ${toneNames[aiTone]}. ` +
      `Formato de publicación: ${previewFormat}.`;

    let user: string;
    switch (action) {
      case 'improve':
        user = `Mejora este copy manteniendo su mensaje y su idioma. Hazlo más claro y con más gancho:\n\n${trimmed}${brief ? `\n\nContexto:\n${brief}` : ''}`;
        break;
      case 'shorten':
        user = `Reescribe este copy para que quepa cómodamente en ${minLimit} caracteres sin perder el mensaje:\n\n${trimmed}`;
        break;
      case 'hashtags':
        user = `Devuelve SOLO una línea con 3-6 hashtags relevantes (sin texto adicional) para este post:\n\n${trimmed}${brief ? `\n\nContexto:\n${brief}` : ''}`;
        break;
      case 'generate':
        user = `Escribe un post desde cero para ${networks}.${trimmed ? `\nIdea inicial: ${trimmed}` : ''}${brief ? `\nBrief:\n${brief}` : ''}`;
        break;
    }

    setAiBusy(action);
    try {
      const result = (await chat([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ])).trim().replace(/^["'`]+|["'`]+$/g, '');
      if (!result) throw new Error('empty response');
      if (action === 'hashtags') {
        setBody((prev) => (prev.trimEnd() ? `${prev.trimEnd()}\n\n${result}` : result));
      } else {
        setBody(result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(t('social.composer.ai_error', { error: msg }));
    } finally {
      setAiBusy(null);
    }
  };

  // ── Schedule quick picks ────────────────────────────────────────────────────
  const setQuickSchedule = (kind: 'today' | 'tomorrow' | 'nextweek') => {
    const d = new Date();
    if (kind === 'today') {
      d.setHours(18, 0, 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    } else if (kind === 'tomorrow') {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    } else {
      d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0);
    }
    setScheduleAt(toLocalInputValue(d.getTime()));
  };

  const save = async () => {
    setError(null);
    if (selectedProviders.length === 0) {
      setError(t('social.composer.error_no_provider'));
      return;
    }
    if (selectedProviders.includes('linkedin') && !linkedInAccountId) {
      setError(t('social.composer.no_account', { provider: PROVIDER_LABELS.linkedin }));
      return;
    }
    if (!body.trim() && media.length === 0) {
      setError(t('social.composer.error_empty'));
      return;
    }
    if (needsMedia) {
      setError(t('social.composer.error_instagram_media'));
      return;
    }
    if (overLimit) {
      setError(t('social.composer.error_too_long', { limit: minLimit }));
      return;
    }

    setSaving(true);
    const scheduledAt = scheduleAt ? new Date(scheduleAt).getTime() : null;
    const topicsArr = topics.split(',').map((s) => s.trim()).filter(Boolean);

    try {
      if (isEditing && editingPost) {
        const res = await window.electron.invoke('social:posts:update', {
          postId: editingPost.id,
          patch: {
            body,
            media,
            linkUrl: linkUrl.trim() || null,
            topics: topicsArr,
            campaign: campaign.trim() || null,
            scheduledAt,
          },
        });
        if (!res?.success) throw new Error(res?.error || 'Error');
      } else {
        const groupId = selectedProviders.length > 1 ? `spg-${Date.now().toString(36)}` : null;
        for (const provider of selectedProviders) {
          const account = provider === 'linkedin'
            ? accounts.find((a) => a.id === linkedInAccountId && a.status === 'active')
            : accounts.find((a) => a.provider === provider && a.status === 'active');
          const res = await window.electron.invoke('social:posts:create', {
            provider,
            accountId: account?.id ?? null,
            body,
            media,
            linkUrl: linkUrl.trim() || null,
            topics: topicsArr,
            campaign: campaign.trim() || null,
            scheduledAt,
            groupId,
          });
          if (!res?.success) throw new Error(res?.error || 'Error');
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const aiButtons: Array<{ action: AiAction; icon: IconSvgElement; label: string }> = [
    { action: 'improve', icon: SparklesIcon, label: t('social.composer.ai_improve') },
    { action: 'shorten', icon: Scissor01Icon, label: t('social.composer.ai_shorten') },
    { action: 'hashtags', icon: HashIcon, label: t('social.composer.ai_hashtags') },
    { action: 'generate', icon: MagicWand01Icon, label: t('social.composer.ai_generate') },
  ];

  return (
    <InlineDetailCard
      onClose={onClose}
      containerName="social-compose"
      title={isEditing ? t('social.composer.edit_title') : t('social.composer.title')}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {t('social.composer.cancel')}
          </Button>
          <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {scheduleAt ? t('social.composer.save_scheduled') : t('social.composer.save_draft')}
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 @[40rem]/social-compose:grid-cols-[minmax(0,1fr)_220px]">
      <div className="flex min-w-0 flex-col gap-5">
          {/* Provider selector */}
          <div className="flex items-center gap-2 flex-wrap">
            {ALL_PROVIDERS.map((p) => {
              const icon = PROVIDER_ICONS[p];
              const active = selectedProviders.includes(p);
              const hasAccount = accounts.some((a) => a.provider === p && a.status === 'active');
              return (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  onClick={() => toggleProvider(p)}
                  disabled={isEditing && p !== editingPost?.provider}
                  className="text-xs"
                  title={hasAccount ? PROVIDER_LABELS[p] : t('social.composer.no_account', { provider: PROVIDER_LABELS[p] })}
                >
                  <HugeiconsIcon icon={icon} className="size-3.5" />
                  {PROVIDER_LABELS[p]}
                  {!hasAccount && ' ⚠︎'}
                </Button>
              );
            })}
          </div>

          {selectedProviders.includes('linkedin') && linkedInAccounts.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <SectionLabel>{t('social.composer.linkedin_account_label')}</SectionLabel>
              <div className="flex items-center gap-1.5 flex-wrap">
                {linkedInAccounts.map((acc) => {
                  const isOrg = acc.accountKind === 'organization';
                  const active = linkedInAccountId === acc.id;
                  return (
                    <Button
                      key={acc.id}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      onClick={() => setLinkedInAccountId(acc.id)}
                      disabled={isEditing}
                      className="text-xs"
                    >
                      {isOrg ? <HugeiconsIcon icon={Building2Icon} className="size-3.5" /> : <HugeiconsIcon icon={Linkedin01Icon} className="size-3.5" />}
                      <span className="max-w-[180px] truncate">{acc.displayName || acc.handle || acc.id}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Post type filter (per network shown in the preview) */}
          <div className="flex flex-col gap-1.5">
            <SectionLabel>
              {t('social.composer.format_label')}
              {selectedProviders.length > 1 ? ` · ${PROVIDER_LABELS[previewProvider]}` : ''}
            </SectionLabel>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PROVIDER_FORMATS[previewProvider].map((f) => (
                <Button
                  key={f}
                  type="button"
                  size="xs"
                  variant={previewFormat === f ? 'default' : 'outline'}
                  className="rounded-full text-xs"
                  onClick={() => setFormatOverrides((prev) => ({ ...prev, [previewProvider]: f }))}
                >
                  {t(`social.preview.format_${f}`)}
                </Button>
              ))}
            </div>
          </div>

          {/* Body + AI assistant */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <SectionLabel>{t('social.composer.section_content')}</SectionLabel>
              <div className="flex items-center gap-1 flex-wrap">
                <Select
                  value={aiTone}
                  onValueChange={(v) => { if (v != null) setAiTone(v as AiTone); }}
                  items={AI_TONES.map((tone) => ({ value: tone, label: t(`social.composer.ai_tone_${tone}`) }))}
                >
                  <SelectTrigger size="sm" className="h-7 text-[11px]" title={t('social.composer.ai_assist_label')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent><SelectGroup>
                    {AI_TONES.map((tone) => (
                      <SelectItem key={tone} value={tone}>{t(`social.composer.ai_tone_${tone}`)}</SelectItem>
                    ))}
                  </SelectGroup></SelectContent>
                </Select>
                {aiButtons.map(({ action, icon, label }) => (
                  <Button
                    key={action}
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => void runAiAssist(action)}
                    disabled={aiBusy !== null}
                    className="text-[11px] text-primary"
                    title={label}
                  >
                    {aiBusy === action ? <Spinner className="size-3" /> : <HugeiconsIcon icon={icon} className="size-3" />}
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder={t('social.composer.body_placeholder')}
              className="resize-y"
              aria-invalid={overLimit || undefined}
            />
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-muted-foreground">
                {selectedProviders.length > 1 && selectedProviders.map((p) => (
                  <span
                    key={p}
                    className={cn(body.length > PROVIDER_CHAR_LIMITS[p] ? 'text-destructive' : 'text-muted-foreground')}
                  >
                    {PROVIDER_LABELS[p]} {body.length}/{PROVIDER_CHAR_LIMITS[p]}
                  </span>
                ))}
              </span>
              <span className={cn(overLimit ? 'text-destructive' : 'text-muted-foreground')}>
                {body.length} / {minLimit}
              </span>
            </div>
          </div>

          {/* Media — local files, vault resources, or public URL */}
          <div className="flex flex-col gap-2">
            <SectionLabel>{t('social.composer.section_media')}</SectionLabel>
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => void pickLocalFiles()}>
                <HugeiconsIcon icon={ComputerIcon} className="size-3.5 text-primary" />
                {t('social.composer.media_from_computer')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={showLibrary ? 'secondary' : 'outline'}
                className="text-xs"
                onClick={() => setShowLibrary((v) => !v)}
              >
                <HugeiconsIcon icon={LibraryIcon} className="size-3.5 text-primary" />
                {t('social.composer.media_from_library')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={showUrlInput ? 'secondary' : 'outline'}
                className="text-xs text-muted-foreground"
                onClick={() => setShowUrlInput((v) => !v)}
              >
                <HugeiconsIcon icon={Link02Icon} className="size-3.5" />
                {t('social.composer.media_from_url')}
              </Button>
            </div>

            {showLibrary && (
              <div className="max-h-64 overflow-y-auto rounded-md border bg-card">
                {library === null ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                    <Spinner className="size-3.5" />
                    {t('common.loading')}
                  </div>
                ) : library.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {t('social.composer.library_empty')}
                  </p>
                ) : (
                  <SocialLibraryTree
                    items={library}
                    onPick={addLibraryItem}
                    selectedIds={selectedLibraryIds}
                  />
                )}
              </div>
            )}

            {showUrlInput && (
              <div className="flex items-center gap-2">
                <Input
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMedia()}
                  placeholder={t('social.composer.media_placeholder')}
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  className="text-primary"
                  onClick={addMedia}
                  title={t('social.composer.add_media')}
                  aria-label={t('social.composer.add_media')}
                >
                  <HugeiconsIcon icon={ImageAdd01Icon} className="size-4" />
                </Button>
              </div>
            )}

            {media.map((m, i) => {
              const isVideo = m.type === 'video' || m.type === 'reel';
              return (
                <div
                  key={`${m.url ?? m.path ?? m.resourceId}-${i}`}
                  className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-xs text-muted-foreground"
                >
                  {m.url ? (
                    <Button
                      type="button"
                      onClick={() => toggleMediaType(i)}
                      className="flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-primary hover:bg-accent"
                      title={t('social.composer.media_toggle_type')}
                    >
                      {isVideo ? <HugeiconsIcon icon={Film01Icon} className="size-3.5" /> : <HugeiconsIcon icon={Image01Icon} className="size-3.5" />}
                      <span className="text-[10px]">
                        {isVideo ? t('social.composer.media_type_video') : t('social.composer.media_type_image')}
                      </span>
                    </Button>
                  ) : isVideo
                    ? <HugeiconsIcon icon={Film01Icon} className="size-3.5 shrink-0 text-primary" />
                    : <HugeiconsIcon icon={Image01Icon} className="size-3.5 shrink-0 text-primary" />}
                  <span className="flex-1 truncate text-foreground">
                    {m.name || m.url || m.path || m.resourceId}
                  </span>
                  <span className="shrink-0">
                    {m.url
                      ? 'URL'
                      : m.resourceId
                        ? t('social.composer.media_source_library')
                        : t('social.composer.media_source_local')}
                  </span>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={t('common.delete')}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-3.5 text-destructive" />
                  </Button>
                </div>
              );
            })}

            {needsMedia && (
              <p className="text-xs text-destructive">
                {t('social.composer.error_instagram_media')}
              </p>
            )}
            {igLocalMediaWarning && (
              <p className="text-xs" style={{ color: 'var(--warning-text, var(--muted-foreground))' }}>
                {t('social.composer.warning_instagram_local_image')}
              </p>
            )}
          </div>

          {/* Details: link, topics, campaign */}
          <div className="flex flex-col gap-2">
            <SectionLabel>{t('social.composer.section_details')}</SectionLabel>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder={t('social.composer.link_placeholder')}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                placeholder={t('social.composer.topics_placeholder')}
                className="min-w-0"
              />
              <Input
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                placeholder={t('social.composer.campaign_placeholder')}
                className="min-w-0"
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="flex flex-col gap-1.5">
            <SectionLabel>{t('social.composer.section_schedule')}</SectionLabel>
            <div className="flex flex-wrap items-center gap-2">
              <DateTimePicker value={scheduleAt} onChange={setScheduleAt} className="shrink-0" />
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="rounded-full text-[11px] text-muted-foreground"
                onClick={() => setQuickSchedule('today')}
              >
                {t('social.composer.schedule_today_evening')}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="rounded-full text-[11px] text-muted-foreground"
                onClick={() => setQuickSchedule('tomorrow')}
              >
                {t('social.composer.schedule_tomorrow_morning')}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="rounded-full text-[11px] text-muted-foreground"
                onClick={() => setQuickSchedule('nextweek')}
              >
                {t('social.composer.schedule_next_week')}
              </Button>
              {scheduleAt && (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="rounded-full text-[11px] text-destructive"
                  onClick={() => setScheduleAt('')}
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                  {t('social.composer.schedule_clear')}
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t('social.composer.schedule_label')}
            </p>
            {scheduleAt && (
              <p className="flex items-center gap-1.5 text-[11px] text-primary">
                <HugeiconsIcon icon={CalendarDaysIcon} className="size-3.5" />
                {t('social.composer.schedule_calendar_note')}
              </p>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {/* Live preview panel */}
      <aside className="min-w-0 flex flex-col gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('social.preview.title')}
        </div>

        {selectedProviders.length > 1 && (
          <div className="flex items-center gap-1 flex-wrap">
            {selectedProviders.map((p) => {
              const icon = PROVIDER_ICONS[p];
              return (
                <Button
                  key={p}
                  type="button"
                  size="xs"
                  variant={previewProvider === p ? 'secondary' : 'ghost'}
                  className="text-[11px]"
                  onClick={() => setPreviewProvider(p)}
                >
                  <HugeiconsIcon icon={icon} className="size-3" />
                  {PROVIDER_LABELS[p]}
                </Button>
              );
            })}
          </div>
        )}

        <SocialPostPreview
          provider={previewProvider}
          format={previewFormat}
          body={body}
          media={media}
          linkUrl={linkUrl.trim()}
          account={previewAccount}
          thumbnails={thumbnails}
        />

        {/* Format-specific hints */}
        {previewProvider === 'instagram' && previewFormat === 'reel' && !previewHasVideo && (
          <p className="text-[11px]" style={{ color: 'var(--warning-text, var(--muted-foreground))' }}>
            {t('social.preview.hint_reel_needs_video')}
          </p>
        )}
        {previewFormat === 'article' && !linkUrl.trim() && (
          <p className="text-[11px]" style={{ color: 'var(--warning-text, var(--muted-foreground))' }}>
            {t('social.preview.hint_article_needs_link')}
          </p>
        )}
        {previewFormat === 'carousel' && media.length < 2 && (
          <p className="text-[11px]" style={{ color: 'var(--warning-text, var(--muted-foreground))' }}>
            {t('social.preview.hint_carousel_needs_images')}
          </p>
        )}
        {(previewFormat === 'video' || previewFormat === 'image') && media.length === 0 && (
          <p className="text-[11px]" style={{ color: 'var(--warning-text, var(--muted-foreground))' }}>
            {t('social.preview.hint_needs_media')}
          </p>
        )}
      </aside>
      </div>
    </InlineDetailCard>
  );
}
