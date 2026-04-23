
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeSegmentedControl from '@/components/ui/DomeSegmentedControl';

/** Tintes discretos por idioma (accesibles sobre fondo claro/oscuro). */
const LANG_COLORS: Record<SupportedLanguage, string> = {
  en: 'var(--accent)',
  es: 'var(--dome-accent)',
  fr: 'var(--accent)',
  pt: 'var(--success)',
};

export default function LanguageSettings() {
  const { t, i18n } = useTranslation();

  const handleSelect = (lang: SupportedLanguage) => {
    changeLanguage(lang);
  };

  const currentLang =
    SUPPORTED_LANGUAGES.find((l) => i18n.language === l || i18n.language.startsWith(`${l}-`)) ?? 'es';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <DomeSubpageHeader
        className="!border-0 px-0 py-0 bg-transparent"
        title={t('settings.language.title')}
        subtitle={t('settings.language.subtitle')}
      />

      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.language.select_label')}</DomeSectionLabel>
        <p className="text-xs mb-4" style={{ color: 'var(--dome-text-muted)' }}>
          {t('settings.language.select_desc')}
        </p>
        <DomeCard className="p-4">
          <DomeSegmentedControl
            className="w-full"
            aria-label={t('settings.language.select_label')}
            options={SUPPORTED_LANGUAGES.map((lang) => {
              const color = LANG_COLORS[lang];
              return {
                value: lang,
                label: `${t(`settings.language.languages.${lang}`)} (${lang.toUpperCase()})`,
                icon: <Languages className="w-3.5 h-3.5" style={{ color }} aria-hidden />,
              };
            })}
            value={currentLang}
            onChange={(v) => handleSelect(v as SupportedLanguage)}
          />
        </DomeCard>
      </div>
    </div>
  );
}
