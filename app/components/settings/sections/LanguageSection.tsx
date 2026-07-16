import { useTranslation } from 'react-i18next';
import { GlobeIcon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SettingsGroup, SettingsSurface } from '../blocks';
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n';

export default function LanguageSection() {
  const { t, i18n } = useTranslation();
  const currentLang =
    SUPPORTED_LANGUAGES.find(
      (lang) => i18n.language === lang || i18n.language.startsWith(`${lang}-`),
    ) ?? 'es';

  return (
    <SettingsSurface
      icon={GlobeIcon}
      title={t('settings.language.title')}
      description={t('settings.language.subtitle')}
    >
      <SettingsGroup
        title={t('settings.language.select_label')}
        description={t('settings.language.select_desc')}
        bare
      >
        <ToggleGroup
          value={[currentLang]}
          onValueChange={(values) =>
            values[0] && changeLanguage(values[0] as SupportedLanguage)
          }
          aria-label={t('settings.language.select_label')}
          className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <ToggleGroupItem
              key={lang}
              value={lang}
              variant="outline"
              aria-label={t(`settings.language.languages.${lang}`)}
              className="h-auto min-h-20 w-full flex-col items-start justify-between gap-2 rounded-xl p-3 text-left data-[state=on]:border-primary data-[state=on]:bg-primary/5"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {lang}
              </span>
              <span className="font-medium">{t(`settings.language.languages.${lang}`)}</span>
              {currentLang === lang ? (
                <Badge variant="secondary">{t('settings.language.selected_badge')}</Badge>
              ) : null}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SettingsGroup>
    </SettingsSurface>
  );
}
