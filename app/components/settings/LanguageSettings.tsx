
import { useTranslation } from 'react-i18next';
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import LanguagePicker from '@/components/settings/LanguagePicker';
import SettingsPanel from '@/components/settings/SettingsPanel';

export default function LanguageSettings() {
  const { t, i18n } = useTranslation();

  const handleSelect = (lang: SupportedLanguage) => {
    changeLanguage(lang);
  };

  const currentLang =
    SUPPORTED_LANGUAGES.find((l) => i18n.language === l || i18n.language.startsWith(`${l}-`)) ?? 'es';

  return (
    <SettingsPanel>
      <DomeSubpageHeader
        className="!border-0 p-0 bg-transparent"
        title={t('settings.language.title')}
        subtitle={t('settings.language.subtitle')}
      />

      <div>
        <DomeSectionLabel className="settings-section-label">
          {t('settings.language.select_label')}
        </DomeSectionLabel>
        <p className="mb-4 text-xs text-[var(--dome-text-muted,var(--tertiary-text))]">
          {t('settings.language.select_desc')}
        </p>
        <LanguagePicker
          aria-label={t('settings.language.select_label')}
          value={currentLang}
          onChange={handleSelect}
        />
      </div>
    </SettingsPanel>
  );
}
