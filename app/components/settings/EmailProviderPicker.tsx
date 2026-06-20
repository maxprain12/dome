import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  EMAIL_PROVIDER_PRESETS,
  type EmailProviderId,
} from '@/lib/email/providerPresets';
import { cn } from '@/lib/utils';

export interface EmailProviderPickerProps {
  value: EmailProviderId;
  onChange: (providerId: EmailProviderId) => void;
}

function ProviderCardCheck({ selected }: { selected: boolean }) {
  return (
    <CheckCircle2
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-2 right-2 size-3.5 shrink-0 transition-opacity duration-150',
        selected ? 'opacity-100' : 'opacity-0',
      )}
      style={{ color: 'var(--dome-accent)' }}
    />
  );
}

export default function EmailProviderPicker({ value, onChange }: EmailProviderPickerProps) {
  const { t } = useTranslation();

  return (
    <div className="email-provider-picker min-w-0 w-full">
      <p className="mb-2 text-xs font-medium" style={{ color: 'var(--dome-text-muted)' }}>
        {t('email.settings.provider_label')}
      </p>
      <div
        role="radiogroup"
        aria-label={t('email.settings.provider_aria')}
        className="email-provider-picker__grid settings-choice-grid settings-choice-grid--3 gap-2"
      >
        {EMAIL_PROVIDER_PRESETS.map((preset) => {
          const selected = value === preset.id;
          const name = t(preset.labelKey);

          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={selected ? t('settings.language.aria_selected', { name }) : name}
              onClick={() => onChange(preset.id)}
              className={cn(
                'email-provider-picker__card settings-provider-card relative flex w-full min-w-0 flex-col items-start p-2.5 pr-7 rounded-xl text-left transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
                selected
                  ? 'border border-[var(--dome-accent,var(--accent))] bg-[var(--dome-accent-subtle,rgba(101,93,197,0.12))] shadow-sm'
                  : 'border border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))] hover:border-[var(--dome-border-hover,var(--border-hover))]',
              )}
            >
              <ProviderCardCheck selected={selected} />
              <span className="settings-provider-card__title w-full min-w-0 truncate text-sm font-semibold text-[var(--dome-text)]">
                {name}
              </span>
              {preset.id !== 'custom' ? (
                <span className="settings-provider-card__subtitle mt-0.5 w-full min-w-0 truncate text-[10px] leading-snug text-[var(--dome-text-muted)]">
                  {preset.servers.imap_host}
                </span>
              ) : (
                <span className="settings-provider-card__subtitle mt-0.5 w-full min-w-0 text-[10px] leading-snug text-[var(--dome-text-muted)]">
                  {t('email.settings.providers.custom_desc')}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
