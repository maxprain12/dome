import { HugeiconsIcon } from '@hugeicons/react';
import {
  CheckmarkCircle02Icon as CheckCircle2,
} from '@hugeicons/core-free-icons';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/lib/store/useUserStore';
import { validateEmail, validateName } from '@/lib/utils/validation';
import { getAnalyticsEnabled, setAnalyticsEnabled } from '@/lib/settings';
import { initPostHog, shutdownPostHog, isPostHogConfigured } from '@/lib/analytics/posthog';
import { initSentry, shutdownSentry } from '@/lib/analytics/sentry';
import SettingsPanel from '@/components/settings/SettingsPanel';

import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';
export default function GeneralSettings() {
  const { t } = useTranslation();
  const { name, email, updateUserProfile, loadUserProfile } = useUserStore();
  const [localName, setLocalName] = useState(name);
  const [localEmail, setLocalEmail] = useState(email);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [isSaved, setIsSaved] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabledState] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  useEffect(() => { loadUserProfile(); }, [loadUserProfile]);
  useEffect(() => { setLocalName(name); setLocalEmail(email); }, [name, email]);
  useEffect(() => {
    getAnalyticsEnabled().then((enabled) => {
      setAnalyticsEnabledState(enabled);
      setAnalyticsLoading(false);
    });
  }, []);

  const handleSave = () => {
    const newErrors: { name?: string; email?: string } = {};
    if (!validateName(localName)) newErrors.name = t('settings.general.error_name');
    if (!validateEmail(localEmail)) newErrors.email = t('settings.general.error_email');
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({});
    updateUserProfile({ name: localName.trim(), email: localEmail.trim() });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
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
    <SettingsPanel>
      <div>
        <h2 className="text-lg font-semibold mb-0.5 text-foreground">
          {t('settings.general.title')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t('settings.general.subtitle')}
        </p>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ">{t('settings.general.profile')}</p>
        <Card className="p-4">
          <div className="flex flex-col gap-4">
            <Field className="gap-1.5" data-invalid={Boolean(errors.name)}><FieldLabel htmlFor="user-name" className="text-xs">{t('settings.general.full_name')}</FieldLabel><Input id="user-name" value={localName} onChange={(e) => {
                setLocalName(e.target.value);
                if (errors.name && validateName(e.target.value)) setErrors((p) => ({ ...p, name: undefined }));
              }} placeholder={t('settings.general.name_placeholder')} autoComplete="name" aria-invalid={Boolean(errors.name) || undefined} /><FieldError className="text-xs">{errors.name}</FieldError></Field>

            <Field className="gap-1.5" data-invalid={Boolean(errors.email)}><FieldLabel htmlFor="user-email" className="text-xs">{t('settings.general.email')}</FieldLabel><Input id="user-email" type="text" inputMode="email" value={localEmail} onChange={(e) => {
                setLocalEmail(e.target.value);
                if (errors.email && validateEmail(e.target.value)) setErrors((p) => ({ ...p, email: undefined }));
              }} placeholder={t('settings.general.email_placeholder')} autoComplete="email" aria-invalid={Boolean(errors.email) || undefined} /><FieldError className="text-xs">{errors.email}</FieldError></Field>

            <div className="flex items-center gap-2 pt-1">
              <Button type="button"
  onClick={handleSave}
  size="sm">
                {t('settings.general.save_changes')}
              </Button>
              {isSaved && (
                <span className="flex items-center gap-1.5 text-xs animate-in fade-in text-primary">
                  <HugeiconsIcon icon={CheckCircle2} className="size-3.5" aria-hidden />
                  {t('settings.general.saved')}
                </span>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ">{t('settings.general.privacy')}</p>
        <Card className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {t('settings.general.analytics_label')}
              </p>
              <p className="text-xs mt-0.5 leading-relaxed text-muted-foreground">
                {t('settings.general.analytics_description')}
              </p>
            </div>
            <Switch checked={analyticsEnabled} onCheckedChange={(v) => void handleAnalyticsToggle(v)} disabled={analyticsLoading || !isPostHogConfigured()} size="sm" className="shrink-0 mt-0.5" />
          </div>
        </Card>
      </div>
    </SettingsPanel>
  );
}
