import { useTranslation } from 'react-i18next';
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n';
import { PageHeader } from '@/components/shared/PageHeader';
import LanguagePicker from '@/components/settings/LanguagePicker';
import SettingsPanel from '@/components/settings/SettingsPanel';

export default function LanguageSettings() {
  const { t, i18n } = useTranslation();
  const currentLang =
    SUPPORTED_LANGUAGES.find((lang) => i18n.language === lang || i18n.language.startsWith(`${lang}-`)) ?? 'es';

  return (
    <SettingsPanel>
      <PageHeader title={t('settings.language.title')} description={t('settings.language.subtitle')} />
      <section className="flex flex-col gap-3" aria-labelledby="settings-language-title">
        <div className="flex flex-col gap-1">
          <h2 id="settings-language-title" className="text-sm font-medium">{t('settings.language.select_label')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.language.select_desc')}</p>
        </div>
        <LanguagePicker
          aria-label={t('settings.language.select_label')}
          value={currentLang}
          onChange={(language: SupportedLanguage) => changeLanguage(language)}
        />
      </section>
    </SettingsPanel>
  );
}
