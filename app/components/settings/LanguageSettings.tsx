
import { useTranslation } from 'react-i18next';
import { Languages, Check } from 'lucide-react';
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n';

const DOME_GREEN = '#596037';

const LANG_COLORS: Record<SupportedLanguage, string> = {
  en: '#3b82f6',
  es: '#596037',
  fr: '#6366f1',
  pt: '#10b981',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
      {children}
    </p>
  );
}

export default function LanguageSettings() {
  const { t, i18n } = useTranslation();

  const handleSelect = (lang: SupportedLanguage) => {
    changeLanguage(lang);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--dome-text)' }}>
          {t('settings.language.title')}
        </h2>
        <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          {t('settings.language.subtitle')}
        </p>
      </div>

      {/* Language selector */}
      <div>
        <SectionLabel>{t('settings.language.select_label')}</SectionLabel>
        <p className="text-xs mb-4" style={{ color: 'var(--dome-text-muted)' }}>
          {t('settings.language.select_desc')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isActive = i18n.language === lang;
            const color = LANG_COLORS[lang];
            return (
              <button
                key={lang}
                type="button"
                onClick={() => handleSelect(lang)}
                className="flex items-center gap-3 p-4 rounded-xl text-left transition-all"
                style={{
                  backgroundColor: isActive ? `${DOME_GREEN}10` : 'var(--dome-surface)',
                  border: isActive ? `2px solid ${DOME_GREEN}` : '2px solid var(--dome-border)',
                }}
              >
                {/* Language icon badge */}
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${color}18` }}
                >
                  <Languages className="w-4 h-4" style={{ color }} />
                </div>

                {/* Language info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: isActive ? DOME_GREEN : 'var(--dome-text)' }}>
                    {t(`settings.language.languages.${lang}`)}
                  </p>
                  <span
                    className="inline-block text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded mt-0.5"
                    style={{
                      backgroundColor: `${color}18`,
                      color,
                    }}
                  >
                    {lang.toUpperCase()}
                  </span>
                </div>

                {/* Active checkmark */}
                {isActive && (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: DOME_GREEN }}
                  >
                    <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
