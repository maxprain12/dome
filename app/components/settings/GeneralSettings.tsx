import { useState, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/lib/store/useUserStore';
import { validateEmail, validateName } from '@/lib/utils/validation';
import { getAnalyticsEnabled, setAnalyticsEnabled } from '@/lib/settings';
import { initPostHog, shutdownPostHog, isPostHogConfigured } from '@/lib/analytics/posthog';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import { DomeInput } from '@/components/ui/DomeInput';
import DomeButton from '@/components/ui/DomeButton';
import DomeToggle from '@/components/ui/DomeToggle';

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
    if (enabled && isPostHogConfigured()) await initPostHog(true);
    else if (!enabled) shutdownPostHog();
    setAnalyticsLoading(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--dome-text)' }}>
          {t('settings.general.title')}
        </h2>
        <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          {t('settings.general.subtitle')}
        </p>
      </div>

      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.general.profile')}</DomeSectionLabel>
        <DomeCard>
          <div className="space-y-4">
            <DomeInput
              id="user-name"
              label={t('settings.general.full_name')}
              value={localName}
              onChange={(e) => {
                setLocalName(e.target.value);
                if (errors.name && validateName(e.target.value)) setErrors((p) => ({ ...p, name: undefined }));
              }}
              placeholder={t('settings.general.name_placeholder')}
              autoComplete="name"
              error={errors.name}
            />

            <DomeInput
              id="user-email"
              label={t('settings.general.email')}
              type="text"
              inputMode="email"
              value={localEmail}
              onChange={(e) => {
                setLocalEmail(e.target.value);
                if (errors.email && validateEmail(e.target.value)) setErrors((p) => ({ ...p, email: undefined }));
              }}
              placeholder={t('settings.general.email_placeholder')}
              autoComplete="email"
              error={errors.email}
            />

            <div className="flex items-center gap-3 pt-1">
              <DomeButton type="button" variant="primary" size="sm" onClick={handleSave}>
                {t('settings.general.save_changes')}
              </DomeButton>
              {isSaved && (
                <span className="flex items-center gap-1.5 text-xs animate-in fade-in text-[var(--accent)]">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
                  {t('settings.general.saved')}
                </span>
              )}
            </div>
          </div>
        </DomeCard>
      </div>

      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.general.privacy')}</DomeSectionLabel>
        <DomeCard>
          <div className="flex items-start gap-4">
            <DomeToggle
              checked={analyticsEnabled}
              onChange={(v) => void handleAnalyticsToggle(v)}
              disabled={analyticsLoading || !isPostHogConfigured()}
              size="sm"
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                {t('settings.general.analytics_label')}
              </p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.general.analytics_description')}
              </p>
            </div>
          </div>
        </DomeCard>
      </div>
    </div>
  );
}
