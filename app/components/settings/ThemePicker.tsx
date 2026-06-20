import { CheckCircle2, Monitor, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DomeIconBox from '@/components/ui/DomeIconBox';
import { cn } from '@/lib/utils';

export type ThemeValue = 'light' | 'dark' | 'auto';

interface ThemeOption {
  value: ThemeValue;
  labelKey: string;
  descKey: string;
  icon: LucideIcon;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', labelKey: 'settings.appearance.light', descKey: 'settings.appearance.light_desc', icon: Sun },
  { value: 'auto', labelKey: 'settings.appearance.system', descKey: 'settings.appearance.system_desc', icon: Monitor },
  { value: 'dark', labelKey: 'settings.appearance.dark', descKey: 'settings.appearance.dark_desc', icon: Moon },
];

export interface ThemePickerProps {
  value: ThemeValue;
  onChange: (theme: ThemeValue) => void;
  'aria-label': string;
}

function ThemeCardCheck({ selected }: { selected: boolean }) {
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

export default function ThemePicker({ value, onChange, 'aria-label': ariaLabel }: ThemePickerProps) {
  const { t } = useTranslation();

  return (
    <div className="theme-picker">
      <div role="radiogroup" aria-label={ariaLabel} className="theme-picker__grid">
        {THEME_OPTIONS.map((theme) => {
          const selected = value === theme.value;
          const Icon = theme.icon;
          const name = t(theme.labelKey);

          return (
            <button
              key={theme.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={selected ? t('settings.language.aria_selected', { name }) : name}
              onClick={() => onChange(theme.value)}
              className={cn(
                'theme-picker__card relative flex w-full min-w-0 flex-col items-start gap-1.5 overflow-hidden rounded-xl p-3 text-left transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
                selected
                  ? 'border border-[var(--dome-accent,var(--accent))] bg-[var(--dome-accent-subtle,rgba(101,93,197,0.12))] shadow-sm'
                  : 'border border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))] hover:border-[var(--dome-border-hover,var(--border-hover))]',
              )}
            >
              <ThemeCardCheck selected={selected} />
              <DomeIconBox
                size="sm"
                className="!size-8 !rounded-md shrink-0"
                background={selected ? 'var(--dome-accent-bg)' : 'var(--dome-bg-hover)'}
              >
                <Icon
                  className="size-4"
                  strokeWidth={1.75}
                  aria-hidden
                  style={{ color: selected ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }}
                />
              </DomeIconBox>
              <span className="w-full min-w-0 truncate font-semibold text-sm text-[var(--dome-text,var(--primary-text))]">
                {name}
              </span>
              <span className="theme-picker__desc w-full min-w-0 text-[10px] leading-snug text-[var(--dome-text-muted,var(--tertiary-text))]">
                {t(theme.descKey)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
