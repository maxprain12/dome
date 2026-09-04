import type { ReactNode } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { hubFieldLabelClass, hubSectionClass, hubSectionTitleClass } from '@/components/shared/hubChrome';
import { cn } from '@/lib/utils';
import type { SocialPost, SocialProvider } from '@/components/social/socialTypes';

export const PROVIDER_LABELS: Record<SocialProvider, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  x: 'X',
};

/** Page title for Social: the network is the subject, never an opaque account id. */
export function socialNetworkTitle(
  accounts: Array<{ id: string; provider: SocialProvider }>,
  accountId: string,
  allLabel: string,
): string {
  if (accountId !== 'all') {
    const selected = accounts.find((account) => account.id === accountId);
    return selected ? PROVIDER_LABELS[selected.provider] : allLabel;
  }
  const providers = [...new Set(accounts.map((account) => account.provider))];
  if (providers.length === 1) {
    const only = providers[0];
    return only ? PROVIDER_LABELS[only] : allLabel;
  }
  return allLabel;
}

export function formatSocialBody(body: string): string {
  return body
    .replace(/@\[([^\]]+)]\(urn:li:(?:person|organization):[^)]+\)/g, '@$1')
    .replace(/\{hashtag\|\\?#([^}]+)}/g, '#$1');
}

export function postStatusBadgeVariant(
  status: SocialPost['status'],
): 'destructive' | 'lime' | 'secondary' | 'outline' {
  switch (status) {
    case 'failed':
      return 'destructive';
    case 'published':
      return 'lime';
    case 'scheduled':
    case 'publishing':
      return 'secondary';
    case 'draft':
      return 'outline';
    default: {
      const _exhaustive: never = status;
      return 'outline';
    }
  }
}

export function campaignStatusBadgeVariant(status: 'active' | 'archived'): 'secondary' | 'outline' {
  return status === 'active' ? 'secondary' : 'outline';
}

export function ProviderMark({
  provider,
  className,
}: {
  provider: SocialProvider;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[0.625rem] font-semibold uppercase text-foreground',
        className,
      )}
    >
      {provider === 'linkedin' ? 'in' : provider === 'instagram' ? 'ig' : 'x'}
    </span>
  );
}

export function ActionIcon({
  label,
  available,
  unavailableLabel,
  icon,
  onClick,
}: {
  label: string;
  available: boolean;
  unavailableLabel: string;
  icon: IconSvgElement;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className="rounded-full"
      disabled={!available}
      title={available ? label : unavailableLabel}
      aria-label={label}
      onClick={onClick}
    >
      <HugeiconsIcon icon={icon} />
    </Button>
  );
}

export function ReadField({ label, value }: { label: string; value: string }) {
  const text = value.trim();
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={hubFieldLabelClass}>{label}</span>
      <span className="truncate text-xs font-medium">{text || '—'}</span>
    </div>
  );
}

export function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={hubSectionClass}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={hubSectionTitleClass}>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}
