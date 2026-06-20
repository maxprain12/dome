import { ExternalLink, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EMAIL_PROVIDER_BY_ID, type EmailProviderId } from '@/lib/email/providerPresets';

export interface EmailProviderGuidesProps {
  providerId: EmailProviderId;
}

export default function EmailProviderGuides({ providerId }: EmailProviderGuidesProps) {
  const { t } = useTranslation();
  const guides = EMAIL_PROVIDER_BY_ID[providerId].guides;

  if (guides.length === 0) return null;

  return (
    <div className="email-provider-guides min-w-0">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
        {t('email.settings.guides.title')}
      </p>
      <ul className="flex flex-wrap gap-1.5 min-w-0">
        {guides.map((guide) => {
          const label = t(guide.labelKey);
          if (guide.helpUrl) {
            return (
              <li key={guide.labelKey}>
                <a
                  href={guide.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="email-provider-guides__chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-90"
                  style={{
                    background: 'var(--dome-accent-subtle, rgba(101, 93, 197, 0.12))',
                    color: 'var(--dome-accent)',
                    border: '1px solid color-mix(in srgb, var(--dome-accent) 25%, transparent)',
                  }}
                >
                  <Info className="size-3 shrink-0" aria-hidden />
                  <span className="min-w-0">{label}</span>
                  <ExternalLink className="size-2.5 shrink-0 opacity-70" aria-hidden />
                </a>
              </li>
            );
          }

          return (
            <li key={guide.labelKey}>
              <span
                className="email-provider-guides__chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{
                  background: 'var(--dome-bg-hover)',
                  color: 'var(--dome-text-muted)',
                  border: '1px solid var(--dome-border)',
                }}
              >
                <Info className="size-3 shrink-0" aria-hidden />
                <span className="min-w-0">{label}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
