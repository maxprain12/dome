import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EMAIL_PROVIDER_PRESETS, type EmailProviderId } from '@/lib/email/providerPresets';

export interface EmailProviderPickerProps {
  value: EmailProviderId;
  onChange: (providerId: EmailProviderId) => void;
}

export default function EmailProviderPicker({ value, onChange }: EmailProviderPickerProps) {
  const { t } = useTranslation();

  return (
    <section className="flex min-w-0 w-full flex-col gap-2" aria-labelledby="email-provider-label">
      <h3 id="email-provider-label" className="text-sm font-medium">
        {t('email.settings.provider_label')}
      </h3>
      <ToggleGroup
        value={[value]}
        onValueChange={(values) => values[0] && onChange(values[0] as EmailProviderId)}
        aria-label={t('email.settings.provider_aria')}
        className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {EMAIL_PROVIDER_PRESETS.map((preset) => (
          <ToggleGroupItem
            key={preset.id}
            value={preset.id}
            variant="outline"
            className="h-auto min-h-16 w-full flex-col items-start gap-1 rounded-xl p-3 text-left data-[state=on]:border-primary data-[state=on]:bg-primary/5"
            aria-label={t(preset.labelKey)}
          >
            <span className="font-medium">{t(preset.labelKey)}</span>
            <span className="whitespace-normal text-xs font-normal text-muted-foreground">
              {preset.id === 'custom' ? t('email.settings.providers.custom_desc') : preset.servers.imap_host}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </section>
  );
}
