
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import SettingsPanel from '@/components/settings/SettingsPanel';
import ThemePicker from '@/components/settings/ThemePicker';

export default function AppearanceSettings() {
  const { t } = useTranslation();
  const currentTheme = useAppStore((s) => s.theme);
  const updateTheme = useAppStore((s) => s.updateTheme);

  return (
    <SettingsPanel>
      <DomeSubpageHeader
        title={t('settings.appearance.title')}
        subtitle={t('settings.appearance.subtitle')}
        className="rounded-xl border border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))] px-4 py-3 mb-2"
      />

      <div>
        <DomeSectionLabel className="settings-section-label">{t('settings.appearance.theme')}</DomeSectionLabel>
        <ThemePicker
          aria-label={t('settings.appearance.theme')}
          value={currentTheme}
          onChange={(v) => updateTheme(v)}
        />
      </div>

      <div>
        <DomeSectionLabel className="settings-section-label">{t('settings.appearance.customization')}</DomeSectionLabel>
        <DomeCard>
          <div className="settings-coming-soon opacity-40">
            <div className="size-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--dome-bg-hover)' }}>
              <div className="size-4 rounded-full" style={{ backgroundColor: 'var(--dome-accent-bg)' }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>
                {t('settings.appearance.custom_label')}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.appearance.custom_desc')}
              </p>
            </div>
          </div>
        </DomeCard>
      </div>
    </SettingsPanel>
  );
}
