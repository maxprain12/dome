import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import SettingsPanel from '@/components/settings/SettingsPanel';
import ThemePicker from '@/components/settings/ThemePicker';
import { resetLayoutPreferences } from '@/lib/shell/layoutReset';

export default function AppearanceSettings() {
  const { t } = useTranslation();
  const currentTheme = useAppStore((s) => s.theme);
  const updateTheme = useAppStore((s) => s.updateTheme);

  const handleResetLayout = useCallback(() => {
    resetLayoutPreferences();
  }, []);

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
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>
                {t('settings.appearance.reset_layout_label')}
              </p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.appearance.reset_layout_desc')}
              </p>
            </div>
            <DomeButton
              type="button"
              variant="secondary"
              size="xs"
              onClick={handleResetLayout}
              className="shrink-0 gap-1"
              leftIcon={<RotateCcw className="size-3" aria-hidden />}
            >
              {t('settings.appearance.reset_layout_action')}
            </DomeButton>
          </div>
        </DomeCard>
      </div>
    </SettingsPanel>
  );
}
