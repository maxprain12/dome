import AccountAccessPanel from '@/components/account/AccountAccessPanel';
import { useDomeSession } from '@/lib/hooks/useDomeSession';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkCircle02Icon, UserIcon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import { useUserStore } from '@/lib/store/useUserStore';
import UserAvatar from '@/components/user/UserAvatar';
import ProfilePhotoPicker from '@/components/user/ProfilePhotoPicker';
import { validateEmail, validateName } from '@/lib/utils/validation';
import { getAnalyticsEnabled, setAnalyticsEnabled } from '@/lib/settings';
import { initPostHog, shutdownPostHog, isPostHogConfigured } from '@/lib/analytics/posthog';
import { initSentry, shutdownSentry } from '@/lib/analytics/sentry';

export default function GeneralSection() {
  const { t } = useTranslation();
  const session = useDomeSession();
  const { name, email, avatarData, avatarPath, avatarUrl, updateUserProfile, loadUserProfile } = useUserStore();
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoSaved, setPhotoSaved] = useState(false);
  const [localName, setLocalName] = useState(name);
  const [localEmail, setLocalEmail] = useState(email);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [isSaved, setIsSaved] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabledState] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  useEffect(() => {
    loadUserProfile();
  }, [loadUserProfile]);

  useEffect(() => {
    setLocalName(name);
    setLocalEmail(email);
  }, [name, email]);

  useEffect(() => {
    getAnalyticsEnabled().then((enabled) => {
      setAnalyticsEnabledState(enabled);
      setAnalyticsLoading(false);
    });
  }, []);

  const handlePhoto = (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    setPhotoSaved(false);
    if (file.size > 2 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError(t('settings.general.photo_too_large'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      setPhotoBusy(true);
      window.electron.domeAuth.uploadAvatar(dataUrl).then(async (result) => {
        if (!result.success || !result.imageUrl) {
          setPhotoError(t('settings.general.photo_error'));
          return;
        }
        await updateUserProfile({ avatarUrl: result.imageUrl, avatarPath: undefined });
        setPhotoSaved(true);
      }).catch(() => {
        setPhotoError(t('settings.general.photo_error'));
      }).finally(() => {
        setPhotoBusy(false);
      });
    };
    reader.readAsDataURL(file);
  };

  const hasChanges = localName.trim() !== name || localEmail.trim() !== email;

  const handleSave = async () => {
    if (profileSaving || !hasChanges) return;
    setIsSaved(false); setSaveFailed(false);
    const newErrors: { name?: string; email?: string } = {};
    if (!validateName(localName)) newErrors.name = t('settings.general.error_name');
    if (localEmail.trim() && !validateEmail(localEmail)) newErrors.email = t('settings.general.error_email');
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setProfileSaving(true);
    try { await updateUserProfile({ name: localName.trim(), email: localEmail.trim() }); setIsSaved(true); }
    catch { setSaveFailed(true); }
    finally { setProfileSaving(false); }
  };

  const handleAnalyticsToggle = async (enabled: boolean) => {
    setAnalyticsLoading(true);
    await setAnalyticsEnabled(enabled);
    setAnalyticsEnabledState(enabled);
    if (enabled) {
      // Sentry (errors/crashes/perf) also forwards consent to the main process.
      initSentry(true);
      if (isPostHogConfigured()) await initPostHog(true);
    } else {
      shutdownSentry();
      shutdownPostHog();
    }
    setAnalyticsLoading(false);
  };

  return (
    <SettingsSurface section="general"
      icon={UserIcon}
      title={t('settings.general.title')}
      description={t('settings.general.subtitle')}
    >
      <AccountAccessPanel />
      <SettingsGroup title={t('settings.general.profile')} description={t('settingsGuide.ai.profile_hint')}>
        <form className="px-4 py-4" onSubmit={(event) => { event.preventDefault(); void handleSave(); }}>
          <FieldGroup>
            {saveFailed && <Alert variant="destructive"><AlertDescription>{t('settingsGuide.ai.save_error')}</AlertDescription></Alert>}
            <div className="flex items-center gap-4">
              <UserAvatar
                name={localName || name || t('userMenu.default_name')}
                avatarData={avatarData}
                avatarPath={avatarPath}
                imageUrl={avatarUrl}
                size="xl"
              />
              <div className="min-w-0">
                {session.connected ? <ProfilePhotoPicker
                  label={t('settings.general.photo_change')}
                  busy={photoBusy}
                  onFile={handlePhoto}
                /> : <p className="text-sm text-muted-foreground">{t('access.photo_account')}</p>}
                <p className="mt-1.5 text-xs text-muted-foreground">{t('settings.general.photo_hint')}</p>
                {photoSaved ? (
                  <p className="mt-1 text-xs text-primary">{t('settings.general.photo_saved')}</p>
                ) : null}
                {photoError ? <p className="mt-1 text-xs text-destructive">{photoError}</p> : null}
              </div>
            </div>
            <Field data-invalid={Boolean(errors.name) || undefined}>
              <FieldLabel htmlFor="settings-user-name">
                {t('settings.general.full_name')}
              </FieldLabel>
              <Input
                id="settings-user-name"
                value={localName}
                autoComplete="name"
                disabled={profileSaving}
                placeholder={t('settings.general.name_placeholder')}
                aria-invalid={Boolean(errors.name) || undefined}
                onChange={(e) => {
                  setIsSaved(false); setLocalName(e.target.value);
                  if (errors.name && validateName(e.target.value)) {
                    setErrors((p) => ({ ...p, name: undefined }));
                  }
                }}
              />
              <FieldError>{errors.name}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.email) || undefined}>
              <FieldLabel htmlFor="settings-user-email">
                {t('settings.general.email')}
              </FieldLabel>
              <Input
                id="settings-user-email"
                type="email"
                inputMode="email"
                value={localEmail}
                autoComplete="email"
                disabled={profileSaving}
                placeholder={t('settings.general.email_placeholder')}
                aria-invalid={Boolean(errors.email) || undefined}
                onChange={(e) => {
                  setIsSaved(false); setLocalEmail(e.target.value);
                  if (errors.email && validateEmail(e.target.value)) {
                    setErrors((p) => ({ ...p, email: undefined }));
                  }
                }}
              />
              <FieldError>{errors.email}</FieldError>
            </Field>
            <div className="flex items-center gap-2.5">
              <Button type="submit" className="min-h-9" disabled={profileSaving || !hasChanges}>
                {t(profileSaving ? 'settingsGuide.ai.saving' : 'settings.general.save_changes')}
              </Button>
              {hasChanges && !isSaved && !profileSaving ? <span role="status" className="text-xs text-muted-foreground">{t('settings.general.unsaved_changes')}</span> : null}
              {isSaved ? (
                <span role="status" className="flex items-center gap-1.5 text-xs text-primary">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden />
                  {t('settings.general.saved')}
                </span>
              ) : null}
            </div>
          </FieldGroup>
        </form>
      </SettingsGroup>

      <SettingsGroup title={t('settings.general.privacy')}>
        <SettingsRow
          title={t('settings.general.analytics_label')}
          description={t('settings.general.analytics_description')}
          control={
            <Switch
              checked={analyticsEnabled}
              onCheckedChange={handleAnalyticsToggle}
              disabled={analyticsLoading || !isPostHogConfigured()}
              aria-label={t('settings.general.analytics_label')}
            />
          }
        />
      </SettingsGroup>
    </SettingsSurface>
  );
}
