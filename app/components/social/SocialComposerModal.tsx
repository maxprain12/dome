import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Linkedin, Instagram, Twitter, Loader2, ImagePlus, Trash2,
  Monitor, Library, Link2, Image as ImageIcon, Film,
} from 'lucide-react';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import { useAppStore } from '@/lib/store/useAppStore';
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

const PROVIDER_ICONS = { linkedin: Linkedin, instagram: Instagram, x: Twitter } as const;
const PROVIDER_LABELS = { linkedin: 'LinkedIn', instagram: 'Instagram', x: 'X' } as const;
const ALL_PROVIDERS: SocialProvider[] = ['linkedin', 'instagram', 'x'];

interface Props {
  accounts: SocialAccount[];
  editingPost: SocialPost | null;
  onClose: () => void;
  onSaved: () => void;
}

function toLocalInputValue(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SocialComposerModal({ accounts, editingPost, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [selectedProviders, setSelectedProviders] = useState<SocialProvider[]>(
    editingPost ? [editingPost.provider] : ['linkedin'],
  );
  const [body, setBody] = useState(editingPost?.body ?? '');
  const [linkUrl, setLinkUrl] = useState(editingPost?.linkUrl ?? '');
  const [mediaUrl, setMediaUrl] = useState('');
  const [media, setMedia] = useState<SocialMediaItem[]>(editingPost?.media ?? []);
  const [topics, setTopics] = useState((editingPost?.topics ?? []).join(', '));
  const [campaign, setCampaign] = useState(editingPost?.campaign ?? '');
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
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');

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

  const addLibraryItem = (item: SocialLibraryItem) => {
    setMedia((prev) =>
      prev.some((m) => m.resourceId === item.resourceId)
        ? prev
        : [...prev, { type: item.type, resourceId: item.resourceId, name: item.title }],
    );
  };

  const addMedia = () => {
    const url = mediaUrl.trim();
    if (!url) return;
    setMedia((prev) => [...prev, { type: 'image', url }]);
    setMediaUrl('');
  };

  const save = async () => {
    setError(null);
    if (selectedProviders.length === 0) {
      setError(t('social.composer.error_no_provider'));
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
          const account = accounts.find((a) => a.provider === provider && a.status === 'active');
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

  return (
    <DomeModal
      open
      onClose={onClose}
      title={isEditing ? t('social.composer.edit_title') : t('social.composer.title')}
      size="xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <DomeButton variant="secondary" onClick={onClose}>
            {t('social.composer.cancel')}
          </DomeButton>
          <DomeButton variant="primary" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {scheduleAt ? t('social.composer.save_scheduled') : t('social.composer.save_draft')}
          </DomeButton>
        </div>
      }
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4 min-w-0">
          {/* Provider selector */}
          <div className="flex items-center gap-2">
            {ALL_PROVIDERS.map((p) => {
              const Icon = PROVIDER_ICONS[p];
              const active = selectedProviders.includes(p);
              const hasAccount = accounts.some((a) => a.provider === p && a.status === 'active');
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggleProvider(p)}
                  disabled={isEditing && p !== editingPost?.provider}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                  style={{
                    background: active ? 'var(--dome-accent)' : 'var(--dome-bg-secondary)',
                    color: active ? 'white' : 'var(--dome-text-muted)',
                    border: '1px solid var(--dome-border)',
                  }}
                  title={hasAccount ? PROVIDER_LABELS[p] : t('social.composer.no_account', { provider: PROVIDER_LABELS[p] })}
                >
                  <Icon className="size-3.5" />
                  {PROVIDER_LABELS[p]}
                  {!hasAccount && ' ⚠︎'}
                </button>
              );
            })}
          </div>

          {/* Body */}
          <div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder={t('social.composer.body_placeholder')}
              className="w-full rounded-md px-3 py-2 text-sm resize-y"
              style={{
                background: 'var(--dome-bg-secondary)',
                border: `1px solid ${overLimit ? 'var(--dome-error)' : 'var(--dome-border)'}`,
                color: 'var(--dome-text)',
              }}
            />
            <div className="text-right text-xs" style={{ color: overLimit ? 'var(--dome-error)' : 'var(--dome-text-muted)' }}>
              {body.length} / {minLimit}
            </div>
          </div>

          {/* Link */}
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder={t('social.composer.link_placeholder')}
            className="w-full rounded-md px-3 py-2 text-sm"
            style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
          />

          {/* Media — local files, vault resources, or public URL */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => void pickLocalFiles()}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
                style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
              >
                <Monitor className="size-3.5" style={{ color: 'var(--dome-accent)' }} />
                {t('social.composer.media_from_computer')}
              </button>
              <button
                type="button"
                onClick={() => setShowLibrary((v) => !v)}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
                style={{
                  border: '1px solid var(--dome-border)',
                  color: 'var(--dome-text)',
                  background: showLibrary ? 'var(--dome-bg-secondary)' : 'transparent',
                }}
              >
                <Library className="size-3.5" style={{ color: 'var(--dome-accent)' }} />
                {t('social.composer.media_from_library')}
              </button>
              <button
                type="button"
                onClick={() => setShowUrlInput((v) => !v)}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
                style={{
                  border: '1px solid var(--dome-border)',
                  color: 'var(--dome-text-muted)',
                  background: showUrlInput ? 'var(--dome-bg-secondary)' : 'transparent',
                }}
              >
                <Link2 className="size-3.5" />
                {t('social.composer.media_from_url')}
              </button>
            </div>

            {showLibrary && (
              <div
                className="rounded-md max-h-40 overflow-y-auto"
                style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)' }}
              >
                {library === null ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                    <Loader2 className="size-3.5 animate-spin" />
                    {t('common.loading')}
                  </div>
                ) : library.length === 0 ? (
                  <p className="px-3 py-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                    {t('social.composer.library_empty')}
                  </p>
                ) : (
                  library.map((item) => (
                    <button
                      key={item.resourceId}
                      type="button"
                      onClick={() => addLibraryItem(item)}
                      className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--dome-bg-hover)]"
                      style={{ color: 'var(--dome-text)' }}
                    >
                      {item.type === 'video'
                        ? <Film className="size-3.5 shrink-0" style={{ color: 'var(--dome-accent)' }} />
                        : <ImageIcon className="size-3.5 shrink-0" style={{ color: 'var(--dome-accent)' }} />}
                      <span className="truncate">{item.title}</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {showUrlInput && (
              <div className="flex items-center gap-2">
                <input
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMedia()}
                  placeholder={t('social.composer.media_placeholder')}
                  className="flex-1 min-w-0 rounded-md px-3 py-2 text-sm"
                  style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
                />
                <button
                  type="button"
                  onClick={addMedia}
                  className="p-2 rounded-md"
                  style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-accent)' }}
                  title={t('social.composer.add_media')}
                >
                  <ImagePlus className="size-4" />
                </button>
              </div>
            )}

            {media.map((m, i) => (
              <div
                key={`${m.url ?? m.path ?? m.resourceId}-${i}`}
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs"
                style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
              >
                {m.type === 'video' || m.type === 'reel'
                  ? <Film className="size-3.5 shrink-0" style={{ color: 'var(--dome-accent)' }} />
                  : <ImageIcon className="size-3.5 shrink-0" style={{ color: 'var(--dome-accent)' }} />}
                <span className="flex-1 truncate" style={{ color: 'var(--dome-text)' }}>
                  {m.name || m.url || m.path || m.resourceId}
                </span>
                <span className="shrink-0">
                  {m.url
                    ? 'URL'
                    : m.resourceId
                      ? t('social.composer.media_source_library')
                      : t('social.composer.media_source_local')}
                </span>
                <button type="button" onClick={() => setMedia((prev) => prev.filter((_, j) => j !== i))}>
                  <Trash2 className="size-3.5" style={{ color: 'var(--dome-error)' }} />
                </button>
              </div>
            ))}

            {needsMedia && (
              <p className="text-xs" style={{ color: 'var(--dome-error)' }}>
                {t('social.composer.error_instagram_media')}
              </p>
            )}
            {igLocalMediaWarning && (
              <p className="text-xs" style={{ color: 'var(--warning-text, var(--dome-text-muted))' }}>
                {t('social.composer.warning_instagram_local_image')}
              </p>
            )}
          </div>

          {/* Topics + campaign */}
          <div className="grid grid-cols-2 gap-3">
            <input
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              placeholder={t('social.composer.topics_placeholder')}
              className="min-w-0 rounded-md px-3 py-2 text-sm"
              style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
            />
            <input
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder={t('social.composer.campaign_placeholder')}
              className="min-w-0 rounded-md px-3 py-2 text-sm"
              style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
            />
          </div>

          {/* Schedule */}
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--dome-text-muted)' }}>
              {t('social.composer.schedule_label')}
            </span>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="mt-1 w-full rounded-md px-3 py-2 text-sm"
              style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
            />
          </label>

          {error && <p className="text-xs" style={{ color: 'var(--dome-error)' }}>{error}</p>}
      </div>

      {/* Live preview panel */}
      <aside className="min-w-0 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
          {t('social.preview.title')}
        </div>

        {selectedProviders.length > 1 && (
          <div className="flex items-center gap-1 flex-wrap">
            {selectedProviders.map((p) => {
              const Icon = PROVIDER_ICONS[p];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreviewProvider(p)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
                  style={{
                    background: previewProvider === p ? 'var(--dome-bg-secondary)' : 'transparent',
                    border: `1px solid ${previewProvider === p ? 'var(--dome-border)' : 'transparent'}`,
                    color: previewProvider === p ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                  }}
                >
                  <Icon className="size-3" />
                  {PROVIDER_LABELS[p]}
                </button>
              );
            })}
          </div>
        )}

        {/* Format chips */}
        <div className="flex items-center gap-1 flex-wrap">
          {PROVIDER_FORMATS[previewProvider].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormatOverrides((prev) => ({ ...prev, [previewProvider]: f }))}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{
                background: previewFormat === f ? 'var(--dome-accent)' : 'var(--dome-bg-secondary)',
                color: previewFormat === f ? 'white' : 'var(--dome-text-muted)',
                border: '1px solid var(--dome-border)',
              }}
            >
              {t(`social.preview.format_${f}`)}
            </button>
          ))}
        </div>

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
          <p className="text-[11px]" style={{ color: 'var(--warning-text, var(--dome-text-muted))' }}>
            {t('social.preview.hint_reel_needs_video')}
          </p>
        )}
        {previewFormat === 'article' && !linkUrl.trim() && (
          <p className="text-[11px]" style={{ color: 'var(--warning-text, var(--dome-text-muted))' }}>
            {t('social.preview.hint_article_needs_link')}
          </p>
        )}
        {previewFormat === 'carousel' && media.length < 2 && (
          <p className="text-[11px]" style={{ color: 'var(--warning-text, var(--dome-text-muted))' }}>
            {t('social.preview.hint_carousel_needs_images')}
          </p>
        )}
        {(previewFormat === 'video' || previewFormat === 'image') && media.length === 0 && (
          <p className="text-[11px]" style={{ color: 'var(--warning-text, var(--dome-text-muted))' }}>
            {t('social.preview.hint_needs_media')}
          </p>
        )}
      </aside>
      </div>
    </DomeModal>
  );
}
