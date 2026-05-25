import { getProviderLogoSrc, isProviderWithBrandLogo, type ProviderWithBrandLogo } from '@/lib/ai/provider-options';
import { cn } from '@/lib/utils';

export interface ProviderBrandIconProps {
  provider: ProviderWithBrandLogo;
  /** Fixed pixel size. Ignored when `fill` is true. */
  size?: number;
  /** Fill the parent container (e.g. DomeIconBox). */
  fill?: boolean;
  className?: string;
}

export default function ProviderBrandIcon({
  provider,
  size = 16,
  fill = false,
  className,
}: ProviderBrandIconProps) {
  return (
    <img
      src={getProviderLogoSrc(provider)}
      alt=""
      aria-hidden
      width={fill ? undefined : size}
      height={fill ? undefined : size}
      className={cn(
        'shrink-0 object-contain',
        fill ? 'size-[78%] max-h-full max-w-full' : '',
        className,
      )}
    />
  );
}

export interface ProviderModelChipProps {
  provider: string;
  label: string;
  className?: string;
}

/** Compact provider badge: brand logo + label (e.g. "minimax / MiniMax-M2.7"). */
export function ProviderModelChip({ provider, label, className }: ProviderModelChipProps) {
  const hasLogo = isProviderWithBrandLogo(provider);
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {hasLogo ? (
        <ProviderBrandIcon provider={provider} size={12} className="!p-0" />
      ) : null}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
