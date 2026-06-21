import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n';
import DomeIconBox from '@/components/ui/DomeIconBox';
import { cn } from '@/lib/utils';

export interface LanguagePickerProps {
  value: SupportedLanguage;
  onChange: (lang: SupportedLanguage) => void;
  'aria-label': string;
}

function LanguageCardCheck({ selected }: { selected: boolean }) {
  return (
    <CheckCircle2
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-2.5 right-2.5 size-4 shrink-0 transition-opacity duration-150',
        selected ? 'opacity-100' : 'opacity-0',
      )}
      style={{ color: 'var(--dome-accent, var(--accent))' }}
    />
  );
}

export default function LanguagePicker({ value, onChange, 'aria-label': ariaLabel }: LanguagePickerProps) {
  const { t } = useTranslation();

  return (
    <div className="language-picker">
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="language-picker__grid"
      >
        {SUPPORTED_LANGUAGES.map((lang) => {
          const selected = value === lang;
          const name = t(`settings.language.languages.${lang}`);

          return (
            <button
              key={lang}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={selected ? t('settings.language.aria_selected', { name }) : name}
              onClick={() => onChange(lang)}
              className={cn(
                'language-picker__card relative flex w-full min-w-0 flex-col items-start gap-1.5 overflow-hidden rounded-xl p-3 text-left transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
                selected
                  ? 'border border-[var(--dome-accent,var(--accent))] bg-[var(--dome-accent-subtle,rgba(101,93,197,0.12))] shadow-sm'
                  : 'border border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))] hover:border-[var(--dome-border-hover,var(--border-hover))]',
              )}
            >
              <LanguageCardCheck selected={selected} />
              <DomeIconBox
                size="sm"
                className="!size-8 !rounded-md shrink-0"
                background={selected ? 'var(--dome-accent-bg)' : 'var(--dome-bg-hover)'}
              >
                <span
                  className="text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: selected ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }}
                  aria-hidden
                >
                  {lang}
                </span>
              </DomeIconBox>
              <span className="w-full min-w-0 truncate font-semibold text-sm text-[var(--dome-text,var(--primary-text))]">
                {name}
              </span>
              {selected ? (
                <span className="language-picker__badge mt-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--dome-accent,var(--accent))] bg-[var(--dome-accent-subtle,rgba(101,93,197,0.12))]">
                  {t('settings.language.selected_badge')}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
