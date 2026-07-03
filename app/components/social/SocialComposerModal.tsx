import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linkedin, Instagram, Twitter, Loader2, ImagePlus, Trash2 } from 'lucide-react';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import {
  PROVIDER_CHAR_LIMITS,
  type SocialAccount,
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

  const isEditing = Boolean(editingPost);

  const minLimit = useMemo(
    () => Math.min(...selectedProviders.map((p) => PROVIDER_CHAR_LIMITS[p])),
    [selectedProviders],
  );
  const overLimit = body.length > minLimit;
  const needsMedia = selectedProviders.includes('instagram') && media.length === 0;

  const toggleProvider = (p: SocialProvider) => {
    if (isEditing) return;
    setSelectedProviders((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
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
      size="lg"
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
      <div className="space-y-4">
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

          {/* Media URLs */}
          <div className="space-y-2">
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
            {media.map((m, i) => (
              <div
                key={`${m.url}-${i}`}
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs"
                style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
              >
                <span className="flex-1 truncate">{m.url}</span>
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
    </DomeModal>
  );
}
