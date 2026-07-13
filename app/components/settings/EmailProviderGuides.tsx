import { HugeiconsIcon } from '@hugeicons/react';
import {
  HelpCircleIcon as CircleHelp,
  ExternalLinkIcon as ExternalLink,
  InformationCircleIcon as Info,
} from '@hugeicons/core-free-icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DEFAULT_ZOHO_REGION, EMAIL_PROVIDER_BY_ID, getZohoGuides, type EmailProviderId, type ZohoRegionId } from '@/lib/email/providerPresets';

export interface EmailProviderGuidesProps {
  providerId: EmailProviderId;
  zohoRegion?: ZohoRegionId;
}

const chipLinkClass =
  'email-provider-guides__chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-90';

const chipMutedClass = 'email-provider-guides__chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium';

function GuideTooltip({ labelKey, chipLabel }: { labelKey: string; chipLabel: string }) {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost"
            type="button"
            className="inline-flex shrink-0 items-center justify-center rounded-full p-0.5 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary text-muted-foreground"
            aria-label={t('email.settings.guides.tooltip_aria', { topic: chipLabel })}
          />
        }
      >
        <HugeiconsIcon icon={CircleHelp} className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] whitespace-normal">
        {t(labelKey)}
      </TooltipContent>
    </Tooltip>
  );
}

export default function EmailProviderGuides({ providerId, zohoRegion = DEFAULT_ZOHO_REGION }: EmailProviderGuidesProps) {
  const { t } = useTranslation();
  const guides =
    providerId === 'zoho' ? getZohoGuides(zohoRegion) : EMAIL_PROVIDER_BY_ID[providerId].guides;

  if (guides.length === 0) return null;

  return (
    <div className="email-provider-guides min-w-0">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('email.settings.guides.title')}
      </p>
      <ul className="flex flex-col gap-1.5 min-w-0">
        {guides.map((guide) => {
          const label = t(guide.labelKey);
          const chip = guide.helpUrl ? (
            <a
              href={guide.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(chipLinkClass, 'border border-primary/25 bg-primary/10 text-primary')}
            >
              <HugeiconsIcon icon={Info} className="size-3 shrink-0" aria-hidden />
              <span className="min-w-0">{label}</span>
              <HugeiconsIcon icon={ExternalLink} className="size-2.5 shrink-0 opacity-70" aria-hidden />
            </a>
          ) : (
            <span
              className={cn(chipMutedClass, 'border bg-accent text-muted-foreground')}
            >
              <HugeiconsIcon icon={Info} className="size-3 shrink-0" aria-hidden />
              <span className="min-w-0">{label}</span>
            </span>
          );

          return (
            <li key={guide.labelKey} className="flex min-w-0 items-center gap-1.5">
              {chip}
              {guide.tooltipKey ? <GuideTooltip labelKey={guide.tooltipKey} chipLabel={label} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
