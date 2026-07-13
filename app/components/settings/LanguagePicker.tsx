import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export interface LanguagePickerProps {
  value: SupportedLanguage;
  onChange: (lang: SupportedLanguage) => void;
  'aria-label': string;
}

export default function LanguagePicker({ value, onChange, 'aria-label': ariaLabel }: LanguagePickerProps) {
  const { t } = useTranslation();

  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(values) => values[0] && onChange(values[0] as SupportedLanguage)}
      aria-label={ariaLabel}
      className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {SUPPORTED_LANGUAGES.map((lang) => {
        const selected = value === lang;
        return (
          <ToggleGroupItem
            key={lang}
            value={lang}
            variant="outline"
            className="h-auto min-h-20 w-full flex-col items-start justify-between gap-2 rounded-xl p-3 text-left data-[state=on]:border-primary data-[state=on]:bg-primary/5"
            aria-label={t(`settings.language.languages.${lang}`)}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{lang}</span>
            <span className="font-medium">{t(`settings.language.languages.${lang}`)}</span>
            {selected ? <Badge variant="secondary">{t('settings.language.selected_badge')}</Badge> : null}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
